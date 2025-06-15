import { Type, Static } from '@sinclair/typebox';

// User Types
export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  username: Type.String({ minLength: 3, maxLength: 50 }),
  firstName: Type.String({ minLength: 1, maxLength: 100 }),
  lastName: Type.String({ minLength: 1, maxLength: 100 }),
  isActive: Type.Boolean(),
  isEmailVerified: Type.Boolean(),
  lastLoginAt: Type.Optional(Type.String({ format: 'date-time' })),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const CreateUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  username: Type.String({ minLength: 3, maxLength: 50 }),
  firstName: Type.String({ minLength: 1, maxLength: 100 }),
  lastName: Type.String({ minLength: 1, maxLength: 100 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
});

export const UpdateUserSchema = Type.Partial(
  Type.Object({
    firstName: Type.String({ minLength: 1, maxLength: 100 }),
    lastName: Type.String({ minLength: 1, maxLength: 100 }),
    username: Type.String({ minLength: 3, maxLength: 50 }),
  })
);

// Authentication Types
export const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
  rememberMe: Type.Optional(Type.Boolean()),
});

export const RefreshTokenSchema = Type.Object({
  refreshToken: Type.String(),
});

export const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword: Type.String({ minLength: 8, maxLength: 128 }),
});

export const ResetPasswordRequestSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

export const ResetPasswordSchema = Type.Object({
  token: Type.String(),
  newPassword: Type.String({ minLength: 8, maxLength: 128 }),
});

// Email Verification Types
export const EmailVerificationSchema = Type.Object({
  token: Type.String(),
});

// Session Types
export const SessionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  deviceInfo: Type.String(),
  ipAddress: Type.String(),
  userAgent: Type.String(),
  isActive: Type.Boolean(),
  expiresAt: Type.String({ format: 'date-time' }),
  createdAt: Type.String({ format: 'date-time' }),
  lastAccessedAt: Type.String({ format: 'date-time' }),
});

// OAuth Types
export const OAuthProviderSchema = Type.Union([
  Type.Literal('google'),
]);

export const OAuthCallbackSchema = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

// Response Types
export const AuthResponseSchema = Type.Object({
  user: UserSchema,
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  message: Type.String(),
  statusCode: Type.Number(),
  correlationId: Type.Optional(Type.String()),
});

export const SuccessResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

// Type exports
export type User = Static<typeof UserSchema>;
export type CreateUser = Static<typeof CreateUserSchema>;
export type UpdateUser = Static<typeof UpdateUserSchema>;
export type Login = Static<typeof LoginSchema>;
export type RefreshToken = Static<typeof RefreshTokenSchema>;
export type ChangePassword = Static<typeof ChangePasswordSchema>;
export type ResetPasswordRequest = Static<typeof ResetPasswordRequestSchema>;
export type ResetPassword = Static<typeof ResetPasswordSchema>;
export type EmailVerification = Static<typeof EmailVerificationSchema>;
export type Session = Static<typeof SessionSchema>;
export type OAuthProvider = Static<typeof OAuthProviderSchema>;
export type OAuthCallback = Static<typeof OAuthCallbackSchema>;
export type AuthResponse = Static<typeof AuthResponseSchema>;
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type SuccessResponse = Static<typeof SuccessResponseSchema>;
