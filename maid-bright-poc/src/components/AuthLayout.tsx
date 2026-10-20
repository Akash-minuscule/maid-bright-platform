import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useResponsive } from '../hooks/useResponsive';
import { colors, ui } from '../theme/tokens';
import { Icon } from './ui';
export function HomeIllustration({ large = false }: { large?: boolean }) {
  return (
    <LinearGradient
      colors={['#E3F1E6', '#F8F7ED']}
      style={{
        borderRadius: 32,
        minHeight: large ? 300 : 205,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        gap: 25,
      }}
    >
      <View style={{ width: 185, height: 155, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 132,
            height: 132,
            borderRadius: 36,
            backgroundColor: '#FFFFFFB3',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-6deg' }],
          }}
        >
          <Icon name="home-outline" size={80} color={colors.primaryDark} />
        </View>
        <View style={{ position: 'absolute', top: 0, right: 0 }}>
          <Icon name="sparkles" size={32} />
        </View>
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 12,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="checkmark" color={colors.white} />
        </View>
      </View>
      <Text style={[ui.label, { textAlign: 'center', color: colors.primary }]}>
        A LITTLE MORE ROOM TO BREATHE
      </Text>
    </LinearGradient>
  );
}
export function AuthLayout({
  title,
  subtitle,
  children,
  welcome = false,
}: React.PropsWithChildren<{ title: string; subtitle: string; welcome?: boolean }>) {
  const r = useResponsive();
  const split = !r.isMobile;
  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView
        style={ui.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: r.gutter,
            paddingVertical: r.isMobile ? 28 : 44,
          }}
        >
          <View
            style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', flexGrow: 1, gap: 28 }}
          >
            <View style={ui.between}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Maid Bright welcome"
                onPress={() => router.navigate('/welcome')}
              >
                <Text
                  style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -1 }}
                >
                  maid<Text style={{ color: colors.primary }}>bright</Text>
                </Text>
              </Pressable>
              <Text style={[ui.caption, { color: colors.primary, fontWeight: '700' }]}>
                CUSTOMER POC
              </Text>
            </View>
            <View
              testID="auth-layout"
              style={{
                flexDirection: split ? 'row' : 'column',
                alignItems: split ? 'center' : 'stretch',
                flexGrow: 1,
                gap: r.isDesktop ? 72 : 28,
              }}
            >
              {split && (
                <View style={{ flex: 1, minWidth: 0, gap: 24 }}>
                  <HomeIllustration large={r.isDesktop} />
                  <Text
                    style={[
                      ui.title,
                      { fontSize: r.isDesktop ? 44 : 34, lineHeight: r.isDesktop ? 51 : 41 },
                    ]}
                  >
                    A bright home.{'\n'}A lighter day.
                  </Text>
                  <Text style={ui.subtitle}>
                    Your cleaning schedule, your preferences, and your Maid Bright team — all in one
                    place.
                  </Text>
                  <View style={ui.row}>
                    <Icon name="checkmark-circle-outline" />
                    <Text style={ui.caption}>Less to manage. More time for you.</Text>
                  </View>
                </View>
              )}
              <View
                style={{
                  flex: split ? 1 : undefined,
                  minWidth: 0,
                  maxWidth: split ? 520 : 640,
                  width: split ? undefined : '100%',
                  alignSelf: split ? 'center' : 'stretch',
                  gap: 22,
                }}
              >
                {welcome && !split && <HomeIllustration />}
                <View style={{ gap: 9 }}>
                  <Text
                    style={[
                      ui.title,
                      { fontSize: welcome && r.isMobile ? 37 : r.isMobile ? 29 : 34 },
                    ]}
                  >
                    {title}
                  </Text>
                  <Text style={ui.subtitle}>{subtitle}</Text>
                </View>
                <View
                  style={
                    welcome ? { gap: 14 } : [ui.card, { padding: r.isMobile ? 18 : 26, gap: 18 }]
                  }
                >
                  {children}
                </View>
                <Text style={[ui.caption, { textAlign: 'center' }]}>
                  Demo only · use fictional details and a sample password.{'\n'}Accounts last until
                  the app is reloaded.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
