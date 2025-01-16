#Error

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
    - body: { 
        prefixName, 
        firstName, 
        lastName, 
        email, 
        password, 
        role,
        position,
        faculty,
        hireYear,
        levelId,
        personnelTypeId,
        departmentId,
        profilePicturePath 
        }

- login
    - method: post
    - route: /login
    - body: { email, password } //password is not hash

- getMe
    - method: get
    - route: /me

- userLanding
    - method: get
    - route: /landing

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