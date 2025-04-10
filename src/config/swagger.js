const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require('path');

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
                url: "http://localhost:8000",
            },
        ],
        components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
              },
            },
          },
          security: [{ bearerAuth: [] }],
    },
    apis: [path.resolve(__dirname, '../routes/*.js')],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };