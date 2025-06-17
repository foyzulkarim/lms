import supertest from "supertest";
import { FastifyInstance } from "fastify";
import { build } from "../src/main";

// Mock the config module - THIS MUST BE AT THE TOP LEVEL
jest.mock("../src/config", () => ({
  config: {
    port: 3000,
    jwt: { secret: "test-secret" },
    cors: { origins: ["*"] },
    rateLimit: { max: 100, timeWindow: "1 minute" },
    services: {
      auth: "http://mocked-auth-service",
      user: "http://mocked-user-service",
      course: "http://mocked-course-service",
    },
  },
}));

describe("API Gateway Tests", () => {
  let app: FastifyInstance;
  // mockInject needs to be accessible in the auth tests beforeEach/afterEach
  // It is defined inside the Auth Endpoints describe block in the AUTH_TESTS_CONTENT
  // which is fine.

  beforeAll(async () => {
    app = build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("should return 200 with status: ok", async () => {
      const response = await supertest(app.server).get("/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    });
  });

describe("Auth Endpoints", () => {
  // app and server are defined in the outer describe block from health check tests
  // We will reuse the `app` instance initialized in the beforeAll of the parent describe.
  // We need a way to mock app.inject for auth tests specifically.

  const mockLoginPayload = { email: "test@example.com", password: "password123" };
  const mockRegisterPayload = { name: "Test User", email: "test@example.com", password: "password123" };
  const mockForgotPasswordPayload = { email: "test@example.com" };
  const mockResetPasswordPayload = { token: "resetToken123", password: "newPassword456" };

  // Store original app.inject
  let originalInject: any;
  // Define mockInject here so it can be referenced in tests
  let mockInject = jest.fn();

  beforeEach(() => {
    // Ensure app is defined (it's from the outer scope)
    if (app && typeof app.inject === 'function') {
      originalInject = app.inject; // Store the original inject
      app.inject = mockInject; // Replace app.inject with our mock for each auth test
    } else {
      // This case should ideally not happen if beforeAll in parent scope ran correctly
      console.warn("App or app.inject is not available for mocking in auth tests.");
    }
    mockInject.mockReset(); // Reset mock before each test
  });

  afterEach(() => {
    // Restore original app.inject after each test if it was mocked
    if (app && originalInject) {
      app.inject = originalInject;
    }
  });

  describe("POST /auth/login", () => {
    it("should call auth service and return its response on valid login", async () => {
      mockInject.mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({ token: "fake-jwt-token" }),
        headers: {}, // Add headers if necessary
        statusMessage: "OK" // Add statusMessage if necessary
      });

      const response = await supertest(app.server)
        .post("/auth/login")
        .send(mockLoginPayload);

      expect(mockInject).toHaveBeenCalledWith({
        method: "POST",
        url: "http://mocked-auth-service/login",
        payload: mockLoginPayload,
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ token: "fake-jwt-token" });
    });

    it("should return 400 on invalid login payload (missing password)", async () => {
      const response = await supertest(app.server)
        .post("/auth/login")
        .send({ email: "test@example.com" }); // Missing password

      expect(response.status).toBe(400);
      expect(mockInject).not.toHaveBeenCalled();
    });
  });

  describe("POST /auth/register", () => {
    it("should call auth service and return its response on valid registration", async () => {
      mockInject.mockResolvedValue({
        statusCode: 201,
        payload: JSON.stringify({ message: "User registered successfully" }),
        headers: {},
        statusMessage: "Created"
      });

      const response = await supertest(app.server)
        .post("/auth/register")
        .send(mockRegisterPayload);

      expect(mockInject).toHaveBeenCalledWith({
        method: "POST",
        url: "http://mocked-auth-service/register",
        payload: mockRegisterPayload,
      });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: "User registered successfully" });
    });

    it("should return 400 on invalid registration payload (invalid email)", async () => {
      const response = await supertest(app.server)
        .post("/auth/register")
        .send({ ...mockRegisterPayload, email: "invalid-email" });

      expect(response.status).toBe(400);
      expect(mockInject).not.toHaveBeenCalled();
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("should call auth service and return its response on valid email", async () => {
      mockInject.mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({ message: "Password reset email sent" }),
        headers: {},
        statusMessage: "OK"
      });

      const response = await supertest(app.server)
        .post("/auth/forgot-password")
        .send(mockForgotPasswordPayload);

      expect(mockInject).toHaveBeenCalledWith({
        method: "POST",
        url: "http://mocked-auth-service/forgot-password",
        payload: mockForgotPasswordPayload,
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "Password reset email sent" });
    });

    it("should return 400 on invalid forgot-password payload (missing email)", async () => {
      const response = await supertest(app.server)
        .post("/auth/forgot-password")
        .send({}); // Missing email

      expect(response.status).toBe(400);
      expect(mockInject).not.toHaveBeenCalled();
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should call auth service and return its response on valid token and password", async () => {
      mockInject.mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({ message: "Password reset successfully" }),
        headers: {},
        statusMessage: "OK"
      });

      const response = await supertest(app.server)
        .post("/auth/reset-password")
        .send(mockResetPasswordPayload);

      expect(mockInject).toHaveBeenCalledWith({
        method: "POST",
        url: "http://mocked-auth-service/reset-password",
        payload: mockResetPasswordPayload,
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "Password reset successfully" });
    });

    it("should return 400 on invalid reset-password payload (missing token)", async () => {
      const response = await supertest(app.server)
        .post("/auth/reset-password")
        .send({ password: "newPassword123" }); // Missing token

      expect(response.status).toBe(400);
      expect(mockInject).not.toHaveBeenCalled();
    });
  });
}); // Closes Auth Endpoints describe
}); // Closes API Gateway Tests describe
