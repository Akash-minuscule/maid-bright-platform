import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Feedback, Field, Screen } from '../../components/ui';
import { useCustomer } from '../../store/AppProvider';
import { useAction } from '../../hooks/useAction';
import { profileForm } from '../../utils/profile';
import { ProfileUpdate } from '../../types/domain';
import { ui } from '../../theme/tokens';
export default function HomeInstructionsScreen() {
  const { data, api, perform, options } = useCustomer();
  const [form, setForm] = useState(() => profileForm(data.customer));
  const action = useAction();
  const fields: {
    key: keyof Pick<
      ProfileUpdate,
      | 'accessInstructions'
      | 'parkingNotes'
      | 'alarmInstructions'
      | 'petInformation'
      | 'serviceNotes'
    >;
    label: string;
  }[] = [
    { key: 'accessInstructions', label: 'Home access instructions' },
    { key: 'parkingNotes', label: 'Parking notes' },
    { key: 'alarmInstructions', label: 'Alarm instructions' },
    { key: 'petInformation', label: 'Pet information' },
    { key: 'serviceNotes', label: 'Cleaning notes for the crew' },
  ];
  return (
    <Screen narrow>
      <Text style={ui.title}>A warm welcome for your team</Text>
      <Text style={ui.subtitle}>
        Share the little details that help every visit go smoothly. Please use fictional information
        in this demo.
      </Text>
      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          value={form[field.key]}
          onChangeText={(value) => setForm((previous) => ({ ...previous, [field.key]: value }))}
          multiline
          maxLength={1000}
        />
      ))}
      <Feedback error={action.error} success={action.success} />
      <Button
        title="Save home instructions"
        busy={action.busy}
        disabled={options.offline}
        onPress={() =>
          action.run(
            () => perform(() => api.updateProfile(form)),
            'Your home instructions have been updated in the demo.',
          )
        }
      />
    </Screen>
  );
}
