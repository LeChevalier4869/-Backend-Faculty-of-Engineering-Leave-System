# run first time

```bash
npm i 
npm start
```

# Environment Required

PORT=
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRESIN=

CLOUDINARY_SECRET=


# Error

leaveType
- can create 

    (use params)
- can't update (type is not number)
- can't delete (type is not number)
- can getAll
- can't getById

#API
## Auth (/auth)
- register (not yet for form-data)
    - method: post
    - route: /register
    - body (form-data): { 
        prefixName, 
        firstName, 
        lastName, 
        sex, 
        username,
        email, 
        password, 
        phone,
        roleNames[], //default = ['USER']
        position,
        hireDate,
        inActive,
        employmentType, //ACADEMIC, SUPPORT
        personnelTypeId,
        profilePicturePath (error)
        }

- login
    - method: post
    - route: /login
    - body: { email, password } //password is not hash // hashed

- getMe
    - method: get
    - route: /me

- userLanding
    - method: get
    - route: /landing

- updateUserRole
    - method: post
    - route: /:id/role
    - params: id
    - body (raw): { roleNames } //array

- updateUser (role = 'ADMIN')
    - method: put
    - route: /users/:id
    - params: id
    - body (raw): {
        prefixName,
        firstName,
        lastName,
        username,
        email,
        phone,
        position,
        hireDate,
        levelId,
        personnelTypeId,
        organizationId,
        departmentId
    }

- updateUser (role = 'USER')
    - method: put
    - route: /users/:id
    - params: id
    - body (raw): {
        prefixName,
        firstName,
        lastName,
        phone,
    }
- updateUserStatus 
    - method: put
    - route: /user-status/:id
    - params: id
    - body (raw): { inActive }

## leave request (/leave-requests)
- createRequest 
    - method: post
    - route: /
    - body: { leaveTypeId, startDate, endDate, reason, isEmergency }

- updateStatus 
    - method: patch
    - route: /status
    - body: { requestId, status }

- getLeaveRequest
    - method: get
    - route: /
    - query: { requestId, userId }

- getLeaveRequestIsMine
    - method: get
    - route: /me

- updateLeaveRequest
    - method: patch
    - route: /
    - params: { requestId }
    - body: { requestId, reason, startDate, endDate, isEmergency }

- approveRequest
    - method: post
    - route: /:id/approve
    - params: id

- rejectRequest
    - method: post
    - route: /:id/reject
    - params: id

- deleteRequest
    - method: delete
    - route: /:id
    - params: id

- updateRequest
    - method: patch
    - route: /:id
    - params: id
    - body: updateData

- getRequestLanding (PENDING)
    - method: get
    - route: /landing

## leave type (/leave-types)
- createLeaveType
    - method: post
    - route: /
    - body: { name, maxDays, conditions }

- updateLeaveType 
    - method: put
    - route: /:id
    - params: id

- deleteLeaveType 
    - method: delete
    - route: /:id
    - params: id

- getAllLeaveType
    - method: get
    - route: /

- getLeaveTypeById 
    - method: get
    - route: /:id
    - params: id  

## leave balance (/leave-balances)
- getLeaveBalance
    - method: get
    - route: /