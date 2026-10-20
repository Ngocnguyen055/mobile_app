import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { styles } from "../styles/auth.ts";
import { colors } from "../styles/theme.ts";
import type { AuthMode } from "../types/index.ts";

type Credentials = {
  name?: string;
  email: string;
  password: string;
};

type Props = {
  mode: AuthMode;
  error: string;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: Credentials) => Promise<void>;
  onClearError: () => void;
};

function authErrorMessage(message: string) {
  if (message === "invalid credentials")
    return "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.";
  if (message === "email already used")
    return "Email này đã được đăng ký. Bạn có thể chuyển sang đăng nhập.";
  if (message.includes("Failed to fetch"))
    return "Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.";
  return message;
}
export default function AuthScreen({
  mode,
  error,
  onModeChange,
  onSubmit,
  onClearError,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  const changeMode = (next: AuthMode) => {
    setLocalError("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    onClearError();
    onModeChange(next);
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (isRegister && !name.trim()) {
      setLocalError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setLocalError("Email chưa đúng định dạng.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Mật khẩu cần có ít nhất 8 ký tự.");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setLocalError("Mật khẩu xác nhận chưa khớp.");
      return;
    }

    setLocalError("");
    onClearError();
    setBusy(true);
    try {
      await onSubmit({
        name: isRegister ? name.trim() : undefined,
        email: normalizedEmail,
        password,
      });
    } finally {
      setBusy(false);
    }
  };

  const displayedError = localError || authErrorMessage(error);

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View pointerEvents="none" style={styles.decorations}>
        <View style={styles.orbTop} />
        <View style={styles.orbSide} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoMark}>✓</Text>
            </View>
            <View>
              <Text style={styles.brandName}>Student Planner</Text>
              <Text style={styles.brandTagline}>
                Học tập chủ động, mỗi ngày.
              </Text>
            </View>
          </View>

          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>
              {isRegister ? "Tạo tài khoản mới" : "Chào mừng trở lại!"}
            </Text>
            <Text style={styles.subtitle}>
              {isRegister
                ? "Bắt đầu quản lý lịch học và dự án của bạn trong vài giây."
                : "Đăng nhập để tiếp tục kế hoạch học tập hôm nay."}
            </Text>
          </View>

          <View style={styles.formCard}>
            {isRegister && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Họ và tên</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.fieldIcon}>◎</Text>
                  <TextInput
                    accessibilityLabel="Họ và tên"
                    autoCapitalize="words"
                    autoComplete="name"
                    editable={!busy}
                    onChangeText={setName}
                    placeholder="Nguyễn Văn A"
                    placeholderTextColor="#9AA1B4"
                    style={styles.input}
                    value={name}
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.fieldIcon}>@</Text>
                <TextInput
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!busy}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onSubmitEditing={() => undefined}
                  placeholder="ban@email.com"
                  placeholderTextColor="#9AA1B4"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mật khẩu</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.fieldIcon}>◇</Text>
                <TextInput
                  accessibilityLabel="Mật khẩu"
                  autoCapitalize="none"
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  editable={!busy}
                  onChangeText={setPassword}
                  onSubmitEditing={() => {
                    if (!isRegister) void submit();
                  }}
                  placeholder="Tối thiểu 8 ký tự"
                  placeholderTextColor="#9AA1B4"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={password}
                />
                <Pressable
                  accessibilityLabel={
                    showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                  }
                  hitSlop={8}
                  onPress={() => setShowPassword((value) => !value)}
                  style={styles.revealButton}
                >
                  <Text style={styles.revealText}>
                    {showPassword ? "Ẩn" : "Hiện"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {isRegister && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Xác nhận mật khẩu</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.fieldIcon}>◇</Text>
                  <TextInput
                    accessibilityLabel="Xác nhận mật khẩu"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!busy}
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={() => void submit()}
                    placeholder="Nhập lại mật khẩu"
                    placeholderTextColor="#9AA1B4"
                    returnKeyType="done"
                    secureTextEntry={!showPassword}
                    style={styles.input}
                    value={confirmPassword}
                  />
                </View>
              </View>
            )}

            {!!displayedError && (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorIcon}>!</Text>
                <Text style={styles.errorText}>{displayedError}</Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                busy && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {isRegister ? "Tạo tài khoản" : "Đăng nhập"}
                  </Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchPrompt}>
              {isRegister ? "Bạn đã có tài khoản?" : "Bạn chưa có tài khoản?"}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => changeMode(isRegister ? "login" : "register")}
            >
              <Text style={styles.switchAction}>
                {isRegister ? "Đăng nhập" : "Đăng ký ngay"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.benefitRow}>
            <Text style={styles.benefit}>✓ Lịch học rõ ràng</Text>
            <Text style={styles.benefit}>✓ Dự án liền mạch</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
