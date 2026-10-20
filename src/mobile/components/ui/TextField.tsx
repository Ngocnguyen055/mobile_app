import React from "react";
import { TextInput } from "react-native";

import { styles } from "../../styles/app.ts";

type TextFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  editable?: boolean;
};

export default function TextField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
}: TextFieldProps) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.multiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#64748b"
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      autoCapitalize="sentences"
      editable={editable}
    />
  );
}
