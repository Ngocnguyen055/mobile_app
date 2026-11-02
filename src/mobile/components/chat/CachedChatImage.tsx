import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  View,
} from "react-native";

import type { ChatAttachment } from "../../domain/chat.ts";
import { ensureCachedChatAttachment } from "../../services/attachmentCache.ts";
import { chatAttachmentUrl, getToken } from "../../services/api.ts";

type Props = {
  attachment: ChatAttachment;
  currentUserId: string;
  resizeMode?: ImageResizeMode;
  style: StyleProp<ImageStyle>;
};

export default function CachedChatImage({
  attachment,
  currentUserId,
  resizeMode = "cover",
  style,
}: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLocalUri(null);
    setFailed(false);
    void ensureCachedChatAttachment(currentUserId, attachment).then(
      (uri) => active && setLocalUri(uri),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [attachment.id, attachment.size, currentUserId]);

  if (!localUri && !failed)
    return (
      <View style={style}>
        <ActivityIndicator />
      </View>
    );

  return (
    <Image
      source={
        localUri
          ? { uri: localUri }
          : {
              uri: chatAttachmentUrl(attachment.id),
              headers: { Authorization: `Bearer ${getToken()}` },
            }
      }
      resizeMode={resizeMode}
      style={style}
    />
  );
}
