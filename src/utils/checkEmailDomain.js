function isCorporateEmail(email) {
    const allowedDomains = ["@rmuti.ac.th"]; 
    return allowedDomains.some((domain) => email.endsWith(domain));
  }
  
  export default {
    isCorporateEmail,
  };