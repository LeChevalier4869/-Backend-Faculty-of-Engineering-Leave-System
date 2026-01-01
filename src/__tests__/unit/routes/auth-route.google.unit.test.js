const request = require("supertest");
const express = require("express");
const passport = require("passport");

// Mock passport
jest.mock("passport", () => ({
  authenticate: jest.fn(),
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn(),
  _strategies: {}
}));

// Mock Google Strategy
jest.mock("passport-google-oauth20", () => ({
  Strategy: jest.fn()
}));

// Mock AuthService
jest.mock("../../../services/auth-service", () => ({
  generateTokens: jest.fn()
}));

describe("Google OAuth Routes", () => {
  let app;
  let authRoute;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Express app
    app = express();
    
    // Mock environment variables
    process.env.NODE_ENV = "development";
    process.env.GOOGLE_CLIENT_ID = "test_client_id";
    process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
    process.env.BACKEND_URL = "http://localhost:8000";
    process.env.FRONTEND_URL = "http://localhost:5173";

    // Clear cache to reinitialize passport
    delete require.cache[require.resolve("../../../config/passport")];
    delete require.cache[require.resolve("../../../routes/auth-route")];
    
    authRoute = require("../../../routes/auth-route");
    app.use("/auth", authRoute);
  });

  describe("GET /auth/google", () => {
    test("should redirect to Google OAuth", async () => {
      const mockAuthenticate = passport.authenticate;
      mockAuthenticate.mockReturnValue((req, res, next) => {
        res.redirect("https://accounts.google.com/oauth/authorize?client_id=test_client_id");
      });

      const response = await request(app).get("/auth/google");

      expect(mockAuthenticate).toHaveBeenCalledWith("google", {
        scope: ["profile", "email"]
      });
      expect(response.status).toBe(302);
    });

    test("should use correct scope parameters", async () => {
      const mockAuthenticate = passport.authenticate;
      mockAuthenticate.mockReturnValue((req, res, next) => {
        res.redirect("https://accounts.google.com/oauth/authorize");
      });

      await request(app).get("/auth/google");

      expect(mockAuthenticate).toHaveBeenCalledWith("google", {
        scope: ["profile", "email"]
      });
    });
  });

  describe("GET /auth/google/callback", () => {
    let mockGenerateTokens;

    beforeEach(() => {
      mockGenerateTokens = require("../../../services/auth-service").generateTokens;
      mockGenerateTokens.mockResolvedValue({
        accessToken: "test_access_token",
        refreshToken: "test_refresh_token"
      });

      // Mock successful passport authentication
      const mockAuthenticate = passport.authenticate;
      mockAuthenticate.mockReturnValue((strategy, options, callback) => {
        return (req, res, next) => {
          // Mock successful authentication
          req.user = {
            id: "test_user_id",
            email: "test@example.com",
            role: "USER"
          };
          callback(req, res, next);
        };
      });
    });

    test("should handle successful Google OAuth callback", async () => {
      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code", state: "test_state" });

      expect(mockGenerateTokens).toHaveBeenCalledWith("test_user_id");
      expect(response.status).toBe(302);
    });

    test("should redirect to correct frontend URL in development", async () => {
      process.env.NODE_ENV = "development";

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.headers.location).toContain("http://localhost:5173/callback");
      expect(response.headers.location).toContain("access=test_access_token");
    });

    test("should redirect to production frontend URL in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.FRONTEND_URL = "https://frontend.example.com";

      // Re-initialize routes with new environment
      delete require.cache[require.resolve("../../../src/routes/auth-route")];
      app = express();
      app.use("/auth", require("../../../src/routes/auth-route"));

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.headers.location).toContain("https://frontend.example.com/callback");
      expect(response.headers.location).toContain("access=test_access_token");
    });

    test("should set refresh token as HttpOnly cookie", async () => {
      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.headers["set-cookie"]).toBeDefined();
      expect(response.headers["set-cookie"][0]).toContain("refreshToken=test_refresh_token");
      expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    });

    test("should use secure cookie in production", async () => {
      process.env.NODE_ENV = "production";

      // Re-initialize routes with new environment
      delete require.cache[require.resolve("../../../src/routes/auth-route")];
      app = express();
      app.use("/auth", require("../../../src/routes/auth-route"));

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.headers["set-cookie"][0]).toContain("Secure");
    });

    test("should not use secure cookie in development", async () => {
      process.env.NODE_ENV = "development";

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.headers["set-cookie"][0]).not.toContain("Secure");
    });

    test("should handle authentication failure", async () => {
      // Mock failed authentication
      const mockAuthenticate = passport.authenticate;
      mockAuthenticate.mockReturnValue((strategy, options, callback) => {
        return (req, res, next) => {
          callback(new Error("Authentication failed"));
        };
      });

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "invalid_code" });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Login failed");
    });

    test("should handle missing frontend URL configuration", async () => {
      delete process.env.FRONTEND_URL;
      process.env.NODE_ENV = "production";

      // Re-initialize routes with new environment
      delete require.cache[require.resolve("../../../src/routes/auth-route")];
      app = express();
      app.use("/auth", require("../../../src/routes/auth-route"));

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.status).toBe(500);
      expect(response.text).toBe("No allowed frontend URL configured.");
    });

    test("should handle origin-based redirect in development", async () => {
      process.env.NODE_ENV = "development";

      const response = await request(app)
        .get("/auth/google/callback")
        .set("Origin", "http://localhost:5173")
        .query({ code: "test_code" });

      expect(response.headers.location).toContain("http://localhost:5173/callback");
    });

    test("should handle token generation errors", async () => {
      mockGenerateTokens.mockRejectedValue(new Error("Token generation failed"));

      const response = await request(app)
        .get("/auth/google/callback")
        .query({ code: "test_code" });

      expect(response.status).toBe(500);
    });
  });

  describe("Environment-based behavior", () => {
    test("should detect development environment correctly", () => {
      process.env.NODE_ENV = "development";

      delete require.cache[require.resolve("../../../src/routes/auth-route")];
      const route = require("../../../src/routes/auth-route");

      // Route should be defined
      expect(route).toBeDefined();
    });

    test("should detect production environment correctly", () => {
      process.env.NODE_ENV = "production";
      process.env.FRONTEND_URL = "https://frontend.example.com";

      delete require.cache[require.resolve("../../../src/routes/auth-route")];
      const route = require("../../../src/routes/auth-route");

      // Route should be defined
      expect(route).toBeDefined();
    });
  });
});
