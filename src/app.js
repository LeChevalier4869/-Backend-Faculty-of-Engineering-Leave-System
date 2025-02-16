require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const helmet = require('helmet');

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self"],
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
const { authenticate } = require('./middlewares/auth');

const authRoute = require('./routes/auth-route');
const leaveRequestRoute = require('./routes/leaveRequest-route');
const leaveTypeRoute = require('./routes/leaveType-route');
const leaveBalance = require('./routes/leaveBalance-route');
const testRote = require('./routes/test-route');

// ทดสอบ pdf------------------------------------------------------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const reportRoutes = require('./routes/reportRoutes');
app.use('/api', reportRoutes);
app.use('/public', express.static('public'));
// ทดสอบ pdf------------------------------------------------------------------------------------------------------------------------


app.use('/auth', authRoute);
app.use('/leave-requests', authenticate, leaveRequestRoute);
app.use('/leave-types', leaveTypeRoute);
app.use('/leave-balances', authenticate, leaveBalance);
app.use('/test', authenticate, testRote);

app.use(errorHandler);
app.use('*', notFoundHandler);

const PORT = process.env.PORT;
app.listen(PORT || 8000, () => console.log(`Server is running on port ${PORT}`));