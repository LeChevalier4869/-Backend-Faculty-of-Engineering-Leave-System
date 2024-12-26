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

- updateStatus (not available)
    - method: patch
    - route: /status
    - body: { requestId, status }

## leave type (/leave-types)
- createLeaveType
    - method: post
    - route: /
    - body: { name, maxDays, conditions }

- updateLeaveType (not available)
    - method: put
    - route: /:id
    - params: id

- deleteLeaveType (not available)
    - method: delete
    - route: /:id
    - params: id

- getAllLeaveType
    - method: get
    - route: /

- getLeaveTypeById (not available)
    - method: get
    - route: /:id
    - params: id  