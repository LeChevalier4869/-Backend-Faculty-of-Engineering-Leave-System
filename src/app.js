require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const passport = require("./config/passport");

const { swaggerUi, specs } = require("./config/swagger");
const { authenticate, authorize } = require("./middlewares/auth");
const errorHandler = require("./middlewares/error");
const notFoundHandler = require("./middlewares/notFound");


// Route modules
// const oauthRoute = require("./routes/oauth-route");
const exelRoute = require("./routes/exel-route");
const authRoute = require("./routes/auth-route");
const userRoute = require("./routes/user-route");
const leaveRequestRoute = require("./routes/leaveRequest-route");
const leaveTypeRoute = require("./routes/leaveType-route");
const leaveBalanceRoute = require("./routes/leaveBalance-route");
const testRoute = require("./routes/test-route");
const adminRoute = require("./routes/admin-route");
const settingRoute = require("./routes/setting-route");
const signatureRoute = require("./routes/signature-route");
const reportRoutes = require("./routes/reportRoutes");
const lookupRoute = require("./routes/lookup-routes");
const adminUserRoute = require("./routes/admin-user-route");
//const reportRouter         = require('./routes/report-router');

// Initialize app
const app = express();

// Session and Passport setup
app.use(session({ secret: "supersecret", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());


app.set("trust proxy", 1);

// Security middleware
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
    },
  })
);

// Report
//app.use('/api', reportRouter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS ---------------------------------------------------
// app.use(cors());
/*
app.use(cors({
  origin: 'https://frontend-faculty-of-engineering-leave-system.vercel.app',  // หรือ '*' ชั่วคราว debug ก็ได้
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
*/
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://frontend-faculty-of-engineering-leave-system.vercel.app',
  'http://localhost:5173' 
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // ถ้าใช้ cookie หรือ auth
}));


// Public & utility routes ------------------------------------------------------------
app.use('/api', reportRoutes);
app.use('/public', express.static('public'));


// Authentication & user management
app.use("/auth", authRoute);
// app.use("/oauth", oauthRoute);
app.use("/api/user", userRoute);

// Leave management
app.use("/leave-requests", leaveRequestRoute);
app.use("/leave-types", leaveTypeRoute);
app.use("/leave-balances", authenticate, leaveBalanceRoute);
app.use("/test", authenticate, testRoute);

// Signature & settings
app.use("/signature", signatureRoute);
app.use("/setting", settingRoute);

// Admin routes (requires ADMIN role)
app.use("/admin", authenticate, adminRoute);
app.use("/admin/users", authenticate, authorize(["ADMIN"]), adminUserRoute);

// Excel upload route
app.use("/excel", exelRoute); //ใช้เพื่อทดสอบเฉยๆ 
// app.use("/excel", authenticate, authorize(["ADMIN"]), exelRoute); //ถ้า oaut เสร็จต้องใช้อันนี้

// Swagger documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Lookup
app.use("/api/lookups", lookupRoute);

// Error handling (must be last)
app.use(errorHandler);
app.use("*", notFoundHandler);


// เรียก reset leave balance เมื่อขึ้นปีงบประมาณใหม่
require("./utils/resetLeaveBalance");

// Server listen
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

