import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Feedback, Field, Icon, Notice, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { colors, ui } from '../../theme/tokens';
import { LOCAL_TIME_LABEL, dateLabel, timeLabel } from '../../utils/format';
export default function MessagesScreen() {
  const { data, api, perform, options } = useCustomer();
  const [body, setBody] = useState('');
  const action = useAction();
  const send = async () => {
    const ok = await action.run(
      () => perform(() => api.sendMessage(body)),
      'Your reply was added to the demo conversation.',
    );
    if (ok) setBody('');
  };
  return (
    <Screen narrow>
      <Text style={ui.title}>Here when you need us</Text>
      <View style={ui.row}>
        <View style={{ padding: 12, borderRadius: 15, backgroundColor: colors.mint }}>
          <Icon name="chatbubble-ellipses-outline" />
        </View>
        <View>
          <Text style={[ui.body, { fontWeight: '700' }]}>Maid Bright team</Text>
          <Text style={ui.caption}>Your cleaning conversation</Text>
        </View>
      </View>
      <Notice text="Messages stay inside this demo. Nothing is sent to the real Maid Bright team." />
      {data.messages.map((message) => {
        const own = message.sender === 'customer';
        return (
          <View
            key={message.id}
            style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: 7 }}
          >
            <View
              style={{
                borderRadius: 18,
                borderBottomRightRadius: own ? 4 : 18,
                borderBottomLeftRadius: own ? 18 : 4,
                padding: 16,
                backgroundColor: own ? colors.primary : colors.white,
                borderWidth: own ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text style={[ui.body, { color: own ? colors.white : colors.ink }]}>
                {message.body}
              </Text>
            </View>
            <Text style={[ui.caption, { fontSize: 10, textAlign: own ? 'right' : 'left' }]}>
              {own ? 'You' : 'Maid Bright'} · {dateLabel(message.sentAt)} ·{' '}
              {timeLabel(message.sentAt)} {LOCAL_TIME_LABEL}
            </Text>
          </View>
        );
      })}
      <View style={ui.divider} />
      <Field
        label="Your message"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
        editable={!action.busy}
        placeholder="Ask a question or share a note…"
      />
      <Feedback error={action.error} success={action.success} />
      <Button
        title="Send demo reply"
        icon="send-outline"
        busy={action.busy}
        disabled={!body.trim() || options.offline}
        onPress={send}
      />
    </Screen>
  );
}
