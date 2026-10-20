export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable = true,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export const friendlyError = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
