import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors, ui } from '../theme/tokens';
import { Icon } from './ui';
export function PasswordField({
  label,
  value,
  onChangeText,
  onSubmitEditing,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  editable?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[ui.body, { fontWeight: '600', fontSize: 14 }]}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 13,
          backgroundColor: colors.white,
          minHeight: 50,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          maxLength={128}
          onSubmitEditing={onSubmitEditing}
          style={{ flex: 1, minWidth: 0, padding: 14, fontSize: 15, color: colors.ink }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          accessibilityState={{ selected: show }}
          onPress={() => setShow((previous) => !previous)}
          style={{ padding: 14 }}
        >
          <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} />
        </Pressable>
      </View>
    </View>
  );
}
