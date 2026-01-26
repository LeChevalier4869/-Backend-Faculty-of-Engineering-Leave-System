const errorHandler = (err, req, res, next) => {
    // ไม่แสดง error details ใน production
    if (process.env.NODE_ENV === 'production') {
        console.error('Error:', err.message); // แสดงแค่ message
        return res.status(err.statusCode || 500).json({ 
            message: err.statusCode ? err.message : 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    }
    
    // Development mode - แสดงรายละเอียดครบๆ
    console.error('Development Error:', err);
    res.status(err.statusCode || 500).json({ 
        message: err.message || 'Internal server error',
        stack: err.stack 
    });
};

module.exports = errorHandler;