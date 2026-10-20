export interface LoginInput {
  email: string;
  password: string;
}
export interface SignUpInput extends LoginInput {
  firstName: string;
  lastName: string;
  phone: string;
  confirmPassword: string;
}
export interface DemoIdentity {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}
