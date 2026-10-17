import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { cardShadow, colors } from "./theme.ts";

export type AuthMode = "login" | "register";

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

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0,
  },
  flex: { flex: 1 },
  decorations: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  orbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#E9E7FF",
    top: -120,
    right: -80,
  },
  orbSide: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#DDF9F4",
    left: -90,
    top: 250,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 42,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    transform: [{ rotate: "-4deg" }],
    ...cardShadow,
  },
  logoMark: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  brandName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  brandTagline: { color: colors.textSoft, fontSize: 12, marginTop: 2 },
  intro: { marginBottom: 24 },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 330,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 17,
    borderWidth: 1,
    borderColor: "rgba(228,231,240,0.8)",
    ...cardShadow,
  },
  fieldGroup: { gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700" },
  inputWrap: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: "#FAFBFE",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  fieldIcon: {
    width: 24,
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  revealButton: { paddingVertical: 8, paddingLeft: 9 },
  revealText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 11,
  },
  errorIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    color: "#FFFFFF",
    backgroundColor: colors.danger,
    fontWeight: "900",
  },
  errorText: { flex: 1, color: "#A52B38", fontSize: 13, lineHeight: 18 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.23,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  buttonArrow: { color: "#FFFFFF", fontSize: 21, lineHeight: 22 },
  buttonPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  disabled: { opacity: 0.55 },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 24,
  },
  switchPrompt: { color: colors.textSoft, fontSize: 14 },
  switchAction: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  benefitRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 28,
  },
  benefit: { color: colors.textSoft, fontSize: 11, fontWeight: "600" },
});
