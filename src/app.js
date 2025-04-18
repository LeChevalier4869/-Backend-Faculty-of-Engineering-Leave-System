require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const helmet = require('helmet');
const { swaggerUi, specs } = require('./config/swagger');

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
    },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const errorHandler = require('./middlewares/error');
const notFoundHandler = require('./middlewares/notFound');
const { authenticate, authorize } = require('./middlewares/auth');

const authRoute = require('./routes/auth-route');
const leaveRequestRoute = require('./routes/leaveRequest-route');
const leaveTypeRoute = require('./routes/leaveType-route');
const leaveBalance = require('./routes/leaveBalance-route');
const testRote = require('./routes/test-route');
const adminRoute = require('./routes/admin-route');
const settingRoute = require('./routes/setting-route');
const signatureRoute = require('./routes/signature-route');
//const roleAssignmentRoute = require('./routes/roleAssignment-route');

// ทดสอบ pdf------------------------------------------------------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const reportRoutes = require('./routes/reportRoutes');
app.use('/api', reportRoutes);
app.use('/public', express.static('public'));
// ทดสอบ pdf------------------------------------------------------------------------------------------------------------------------


app.use('/auth', authRoute);
app.use('/leave-requests', leaveRequestRoute);
app.use('/leave-types', leaveTypeRoute);
app.use('/leave-balances', authenticate, leaveBalance);
app.use('/test', authenticate, testRote);
app.use('/setting', settingRoute);
app.use('/signature', signatureRoute);
//app.use('/role-assignment', authenticate, authorize(['ADMIN']), roleAssignmentRoute);

//swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

//new feature admin
app.use('/admin', authenticate, authorize(['ADMIN']), adminRoute);

app.use(errorHandler);
app.use('*', notFoundHandler);

const PORT = process.env.PORT;
app.listen(PORT || 8000, () => console.log(`Server is running on port ${PORT}`));
