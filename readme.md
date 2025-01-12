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
- login
    - method: post
    - route: /login
    - body: { email, password } //password is not hash

- getMe
    - method: get
    - route: /me

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