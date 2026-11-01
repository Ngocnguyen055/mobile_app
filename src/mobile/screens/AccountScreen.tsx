import React, { memo } from "react";
import { Text, View } from "react-native";

import type { User } from "../services/api.ts";
import Button from "../components/ui/Button.tsx";
import type { ReminderOffset } from "../services/local.ts";
import ReminderSelect from "../components/ui/ReminderSelect.tsx";
import { styles } from "../styles/app.ts";

type AccountScreenProps = {
  user: User;
  reminderOffset: ReminderOffset;
  onReminderChange: (value: ReminderOffset) => void;
  onLogout: () => void;
};

function AccountScreen({
  user,
  reminderOffset,
  onReminderChange,
  onLogout,
}: AccountScreenProps) {
  return (
    <>
      <Text style={styles.pageTitle}>Tài khoản</Text>
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {user.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedText}>✓</Text>
        </View>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>NHẮC VIỆC</Text>
        <Text style={styles.heading}>Nhắc deadline mặc định</Text>
        <Text style={styles.subtitle}>
          Áp dụng cho task được giao và sự kiện mới của bạn.
        </Text>
        <ReminderSelect
          label="Thông báo mặc định"
          zeroLabel="Đúng thời điểm bắt đầu / đến hạn"
          value={reminderOffset}
          onChange={onReminderChange}
        />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>PHIÊN ĐĂNG NHẬP</Text>
        <Text style={styles.subtitle}>
          Đăng xuất sẽ xóa phiên và các nhắc hẹn cục bộ trên thiết bị này.
        </Text>
        <Button label="Đăng xuất" onPress={onLogout} secondary />
      </View>
    </>
  );
}

export default memo(AccountScreen);
