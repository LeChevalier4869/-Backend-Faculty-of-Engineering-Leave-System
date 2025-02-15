// const fs = require('fs');
// const path = require('path');

// function moveFile(sourcePath, destinationPath) {
//   return new Promise((resolve, reject) => {
//     const destinationDir = path.dirname(destinationPath);

//     // สร้างโฟลเดอร์ปลายทางหากไม่มี
//     if (!fs.existsSync(destinationDir)) {
//       fs.mkdirSync(destinationDir, { recursive: true });
//     }

//     // ย้ายไฟล์
//     fs.rename(sourcePath, destinationPath, (err) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(destinationPath);
//       }
//     });
//   });
// }

// module.exports = {
//   moveFile,
// };

//------------------------------------------------------------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

function moveFile(sourcePath, destinationPath) {
  return new Promise((resolve, reject) => {
    const destinationDir = path.dirname(destinationPath);

    // สร้างโฟลเดอร์ปลายทางหากไม่มี
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // ย้ายไฟล์
    fs.rename(sourcePath, destinationPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(destinationPath);
      }
    });
  });
}

module.exports = {
  moveFile,
};