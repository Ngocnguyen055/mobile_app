import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { User } from "../../services/api.ts";
import { filterMembersByEmail } from "../../utils/memberSelection.ts";
import { styles } from "../../styles/memberDropdown.ts";

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
        accessibilityLabel={
          selected ? `${label}: ${selected.name}, ${selected.email}` : label
        }
        accessibilityState={{
          expanded,
          disabled: disabled || loading || !users.length,
        }}
        disabled={disabled || loading || !users.length}
        onPress={() => {
          if (expanded) close();
          else {
            setQuery("");
            setExpanded(true);
          }
        }}
        style={[styles.field, disabled && styles.disabled]}
      >
        <View style={styles.selection}>
          <Text style={[styles.name, !selected && styles.placeholder]}>
            {loading
              ? "Đang tải thành viên dự án tổng…"
              : selected?.name || label}
          </Text>
          {!!selected && <Text style={styles.email}>{selected.email}</Text>}
        </View>
        <Text style={styles.arrow}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {!loading && !users.length && (
        <Text style={styles.hint}>
          Chưa có thành viên phù hợp. Hãy thêm thành viên vào dự án tổng trước.
        </Text>
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
            {!results.length && (
              <Text style={styles.empty}>
                Không tìm thấy thành viên có email phù hợp trong dự án tổng.
              </Text>
            )}
            {results.map((user) => (
              <Pressable
                key={user._id}
                accessibilityRole="radio"
                accessibilityLabel={`${user.name}, ${user.email}`}
                accessibilityState={{ selected: user._id === value }}
                style={[
                  styles.option,
                  user._id === value && styles.selectedOption,
                ]}
                onPress={() => {
                  onChange(user._id);
                  close();
                }}
              >
                <View style={styles.selection}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.email}>{user.email}</Text>
                </View>
                {user._id === value && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={styles.close}
          >
            <Text style={styles.closeText}>Đóng danh sách</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
