import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { User } from "./api.ts";
import { filterMembersByEmail } from "./memberSelection.ts";

type Props = {
  users: User[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
};

/** Search only the supplied project members; entering an email never adds a user. */
export default function MemberDropdown({
  users,
  value,
  onChange,
  disabled = false,
  loading = false,
  label = "Chọn Trưởng phòng",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = users.find((user) => user._id === value);
  const results = filterMembersByEmail(users, query);

  useEffect(() => {
    // Clear a stale selection if a member is removed while this form is open.
    if (!loading && value && !selected) onChange("");
  }, [loading, value, selected, onChange]);

  useEffect(() => {
    if (disabled || loading || !users.length) setExpanded(false);
  }, [disabled, loading, users.length]);

  const close = () => {
    setExpanded(false);
    setQuery("");
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}: ${selected.name}, ${selected.email}` : label}
        accessibilityState={{ expanded, disabled: disabled || loading || !users.length }}
        disabled={disabled || loading || !users.length}
        onPress={() => {
          if (expanded) close();
          else { setQuery(""); setExpanded(true); }
        }}
        style={[styles.field, disabled && styles.disabled]}
      >
        <View style={styles.selection}>
          <Text style={[styles.name, !selected && styles.placeholder]}>
            {loading ? "Đang tải thành viên dự án tổng…" : selected?.name || label}
          </Text>
          {!!selected && <Text style={styles.email}>{selected.email}</Text>}
        </View>
        <Text style={styles.arrow}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {!loading && !users.length && (
        <Text style={styles.hint}>Chưa có thành viên phù hợp. Hãy thêm thành viên vào dự án tổng trước.</Text>
      )}

      {expanded && !disabled && !loading && (
        <View style={styles.menu}>
          <TextInput
            accessibilityLabel="Tìm thành viên dự án tổng theo email"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Nhập email để tìm thành viên"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
          />
          <ScrollView
            style={styles.options}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {!results.length && <Text style={styles.empty}>Không tìm thấy thành viên có email phù hợp trong dự án tổng.</Text>}
            {results.map((user) => (
              <Pressable
                key={user._id}
                accessibilityRole="radio"
                accessibilityLabel={`${user.name}, ${user.email}`}
                accessibilityState={{ selected: user._id === value }}
                style={[styles.option, user._id === value && styles.selectedOption]}
                onPress={() => { onChange(user._id); close(); }}
              >
                <View style={styles.selection}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.email}>{user.email}</Text>
                </View>
                {user._id === value && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={close} style={styles.close}>
            <Text style={styles.closeText}>Đóng danh sách</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#94a3b8", borderRadius: 8, padding: 12, minHeight: 48, backgroundColor: "#fff" },
  selection: { flex: 1, gap: 3 },
  name: { color: "#0f172a", fontSize: 14, fontWeight: "600" },
  email: { color: "#475569", fontSize: 12 },
  placeholder: { color: "#64748b", fontWeight: "400" },
  arrow: { color: "#2563eb", fontSize: 18 },
  disabled: { opacity: 0.5 },
  hint: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  menu: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, backgroundColor: "#fff", overflow: "hidden" },
  search: { borderWidth: 1, borderColor: "#94a3b8", borderRadius: 6, margin: 8, padding: 10, color: "#0f172a", backgroundColor: "#fff" },
  options: { maxHeight: 220 },
  option: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  selectedOption: { backgroundColor: "#eff6ff" },
  check: { color: "#2563eb", fontSize: 18, fontWeight: "700" },
  empty: { padding: 12, color: "#64748b", fontSize: 13, lineHeight: 19 },
  close: { padding: 10, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e2e8f0" },
  closeText: { color: "#2563eb", fontWeight: "600" },
});
