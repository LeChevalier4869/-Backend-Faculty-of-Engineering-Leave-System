function isAllowedEmailDomain(email, allowedDomains = ["rmuti.ac.th"]) {
    if (typeof email !== "string") return false;
  
    const domain = email.split("@")[1];
    return allowedDomains.includes(domain);
  }
  
  module.exports = {
    isAllowedEmailDomain,
  };
  