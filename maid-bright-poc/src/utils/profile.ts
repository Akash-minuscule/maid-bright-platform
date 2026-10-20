import { Customer, ProfileUpdate } from '../types/domain';
export const profileForm = (customer: Customer): ProfileUpdate => ({
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  phone: customer.phone,
  address: { ...customer.address },
  accessInstructions: customer.accessInstructions,
  parkingNotes: customer.parkingNotes,
  alarmInstructions: customer.alarmInstructions,
  petInformation: customer.petInformation,
  serviceNotes: customer.serviceNotes,
});
