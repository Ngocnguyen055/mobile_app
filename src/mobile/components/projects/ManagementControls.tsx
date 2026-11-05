import {
  Pressable,
  Text,
  View
} from "react-native";
import { styles as s } from "../../styles/projectManagement.ts";
import type { User } from "../../types/api.ts";

export function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Picker({
  users,
  value,
  onChange,
  emptyLabel,
}: {
  users: User[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
}) {
  return (
    <View style={s.wrap}>
      {!!emptyLabel && (
        <Pressable
          onPress={() => onChange("")}
          style={[s.choice, !value && s.selected]}
        >
          <Text style={!value ? s.selectedText : s.text}>{emptyLabel}</Text>
        </Pressable>
      )}
      {users.map((user) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value === user._id }}
          key={user._id}
          onPress={() => onChange(user._id)}
          style={[s.choice, value === user._id && s.selected]}
        >
          <Text style={value === user._id ? s.selectedText : s.text}>
            {user.name} · {user.email}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
