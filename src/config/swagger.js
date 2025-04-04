const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// กำหนดค่าเริ่มต้นของ Swagger
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Faculty of Engineering Leave System API",
            version: "1.0.0",
            description: "API Documentation for eLeave System",
        },
        servers: [
            {
                url: "http://localhost:8000/swagger-ui/api",
            },
        ],
    },
    apis: ["./src/routes/*.js"],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };