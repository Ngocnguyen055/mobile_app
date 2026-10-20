import { useEffect } from "react";

import type { User } from "../services/api.ts";
import type { MainView, ProjectTab } from "../types/index.ts";
import type { useChat } from "./useChat.ts";
import type { useProjectCoordinator } from "./useProjectCoordinator.ts";

type Options = {
  user: User | null;
  mainView: MainView;
  tab: ProjectTab;
  projectId?: string;
  chatController: ReturnType<typeof useChat>;
  projectCoordinator: ReturnType<typeof useProjectCoordinator>;
  runAction: (action: () => Promise<unknown>) => void;
  onError: (message: string) => void;
};

export function useAppLifecycle({
  user,
  mainView,
  tab,
  projectId,
  chatController,
  projectCoordinator,
  runAction,
  onError,
}: Options) {
  useEffect(() => {
    if (!user) return;
    let active = true;
    runAction(projectCoordinator.loadHome);
    void chatController.initializePeer(user, () => !active).catch((caught) => {
      if (active) onError(`Lịch sử chat: ${String(caught)}`);
    });
    return () => {
      active = false;
      chatController.disposeChat();
    };
  }, [user?._id]);

  useEffect(() => {
    if (!user || mainView !== "project" || !projectId) return;
    const timer = setInterval(
      () =>
        runAction(async () => {
          await projectCoordinator.loadProject(projectId, false);
          if (tab === "chat") await chatController.ensureGroup();
        }),
      30_000,
    );
    return () => clearInterval(timer);
  }, [user?._id, mainView, projectId, tab]);
}
