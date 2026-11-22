# API reference

Base address: `http://localhost:5000/api`. Everything is JSON.

Every request except sign-in and the public routes needs the login token:

```
Authorization: Bearer <token>
```

Errors come back as `{"error": "A sentence the user can read."}` with a
matching status: 400 invalid, 401 not signed in, 403 not allowed, 404 not
found, 409 conflict, 429 too many tries.

## Sign in and passwords

| Method | Path             | Who    | Body                         | Returns                    |
| ------ | ---------------- | ------ | ---------------------------- | -------------------------- |
| POST   | `/auth/login`    | anyone | `{login, password}`          | `{token, user}`            |
| POST   | `/auth/register` | anyone | `{parent, phone, password, child, classId, message?}` | `{token, user}` (201) |
| GET    | `/auth/me`       | signed in | none                      | `{user}`                   |
| POST   | `/auth/password` | signed in | `{current, new}`          | `{ok}`                     |
| POST   | `/auth/reset`    | admin  | `{login}`                    | `{ok, login, password}`    |
| GET    | `/auth/photo`    | signed in | none                      | `{photo, photoAt}`         |
| PUT    | `/auth/photo`    | signed in | `{photo}`                 | `{photoAt}`                |
| DELETE | `/auth/photo`    | signed in | none                      | `{photoAt}` (empty)        |

`login` is a username for admins and a phone number for teachers and parents.
`0700555001`, `0700 555 001` and `+254700555001` all work.

`/auth/register` is how a family joins: it creates a parent account with the
password they chose and a `New` admission application for their child. The
account stays while the application is New or Contacted, and becomes an
ordinary guardian account once the child is admitted. It is removed if the
application is closed or deleted. A phone number that already has an account
gets 409.

`user` looks like:

```json
{"userId": 14, "role": "teacher", "login": "0700555910", "name": "Kevin Onyango", "staffId": "s11", "id": "s11", "photoAt": "", "since": "2026-10-07"}
```

`id` is the staff id for a teacher, the guardian phone number for a parent and
`"office"` for an admin. `since` is the day the account was made.

The profile picture belongs to the signed-in account. `photo` is a `data:` URL of a JPEG,
PNG or WebP image no bigger than 400 KB; the site sends a 320-pixel square JPEG. Anything
else gets 400. `photoAt` in `user` changes whenever the picture does, so a client fetches
`GET /auth/photo` only when it differs from the copy it holds; it is empty when there is
no picture.

Example:

```
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"login\":\"admin\",\"password\":\"admin123\"}"
```

## Public (no login)

| Method | Path                    | Purpose                                                              |
| ------ | ----------------------- | -------------------------------------------------------------------- |
| GET    | `/public`               | School profile, classes, coming events, public notices, head counts  |
| POST   | `/public/applications`  | Send an admission application without an account: `{child, parent, phone, classId, message}`. The site uses `/auth/register` instead |
| GET    | `/health`               | `{ok: true}` when the server is up                                   |

## School records

| Method | Path                    | Purpose                                                         |
| ------ | ----------------------- | --------------------------------------------------------------- |
| GET    | `/bootstrap`            | `{user, data}`: every collection, filtered for the signed-in user |
| GET    | `/<collection>`         | One collection, filtered the same way                           |
| PUT    | `/<collection>/<id>`    | Create or replace one record (the body is the record)           |
| PATCH  | `/<collection>/<id>`    | Merge marks into a register: body `{"patch": {...}}`            |
| DELETE | `/<collection>/<id>`    | Delete one record                                               |

Ids are chosen by the client (letters, digits and `_ - . : @ + ~`).

### Collections

| Collection     | Saved with | Notes                                                                 |
| -------------- | ---------- | --------------------------------------------------------------------- |
| `config`       | PUT        | One record, id `school`: profile, year, term, fees, learning areas    |
| `classes`      | PUT        | `{name, level, order, teacherId, room}`; level is `pp`, `lower`, `upper` or `junior` |
| `staff`        | PUT        | Saving a teaching role creates that teacher's login                   |
| `learners`     | PUT        | `admNo` must be unique. Saving creates the guardian's login           |
| `routes`       | PUT        | Transport routes with a fee per term                                  |
| `payments`     | PUT        | The server sets `receiptNo` and `by` on new payments                  |
| `expenses`     | PUT        |                                                                       |
| `notices`      | PUT        | `audience` is `All`, `Parents`, `Teachers` or a class id              |
| `events`       | PUT        |                                                                       |
| `homework`     | PUT        |                                                                       |
| `books`        | PUT        | `loans` is a list of `{learnerId, date}`                              |
| `applications` | PUT        | Created by the public form; the office updates `status`               |
| `remarks`      | PUT        | Id `<learnerId>_<year>_T<term>`: `{teacher, head}`                    |
| `messages`     | PUT        | See below                                                             |
| `attendance`   | PATCH      | Id `<classId>_<year>_T<term>`                                         |
| `assessments`  | PATCH      | Id `<classId>_<year>_T<term>`                                         |
| `timetables`   | PATCH      | Id is the class id                                                    |

### Registers (PATCH)

Mark a register for one day. `P` present, `L` late, `A` absent, `null` removes a mark:

```
PATCH /api/attendance/c_g7_2026_T3
{"patch": {"days": {"2026-10-07": {"L1033": "P", "L1034": "A"}}}}
```

Save results for one learning area. Marks out of 100, or `EE`, `ME`, `AE`, `BE` for pre-primary:

```
PATCH /api/assessments/c_g7_2026_T3
{"patch": {"scores": {"mathematics": {"L1033": 88, "L1034": 61}}}}
```

Set one lesson. An empty `a` clears the lesson:

```
PATCH /api/timetables/c_g7
{"patch": {"grid": {"Mon": {"3": {"a": "Mathematics", "t": "s02"}}}}}
```

### Messages

`PUT /api/messages/<id>` starts a conversation if the id is new, or adds one
reply if it exists. Send the conversation with the new message last in `msgs`;
only its `text` is used. Who wrote it and when always come from the login.

```
PUT /api/messages/m123
{"learnerId": "L1037", "to": "office", "subject": "Uniform", "msgs": [{"text": "Where do we buy the sweater?"}]}
```

A parent may write to `"office"` or to their child's class teacher (a staff id).

### Class groups

A class group is the same thread with `kind: "class"` and a `classId`. It holds messages
about every learner in that class, so it is created and run by the school office or the
class teacher, and membership follows the class rather than an invitation list.

| Endpoint                     | Who                        | What                                                     |
| ---------------------------- | -------------------------- | -------------------------------------------------------- |
| `GET /api/groups`            | any signed-in person       | The groups they are in                                   |
| `POST /api/groups`           | office, class teacher      | Open the group for a class, or return the existing one   |
| `POST /api/groups/link`      | office, class teacher      | The invite link; `{"renew": true}` makes a new token     |
| `POST /api/groups/link/off`  | office, class teacher      | Stop the link working, keeping the group and its messages |
| `POST /api/groups/join`      | any signed-in person       | Follow a link; returns the group if they may be in it    |

```
POST /api/groups          {"classId": "c_g9"}
POST /api/groups/link     {"classId": "c_g9"}      -> {"link": "/?join=EgbZRpM1ntEsJesqeL1J3ty2", ...}
POST /api/groups/join     {"token": "EgbZRpM1ntEsJesqeL1J3ty2"}
```

The link carries only an unguessable token that says *which* group to open. It gets nobody
in on its own: `join` still needs a signed-in account, and that account must be the school
office, the class teacher, or the guardian of a learner in that class. A parent is never sent
the token, so they cannot pass it on; the office or teacher can revoke it at any time.

Once in a group, messages go through the same `PUT /api/messages/<group id>` as any other
conversation. `add_missing_columns` in `backend/app/db.py` adds `kind`, `class_id` and
`join_token` to an existing database, so older installs pick this up on the next start.

## Who can do what

| Collection                                   | Admin | Teacher                                   | Parent              |
| -------------------------------------------- | ----- | ----------------------------------------- | ------------------- |
| config, classes, routes, events, timetables  | all   | read                                      | read                |
| staff                                        | all   | read (name, role, phone)                  | read (names; phone of own class teachers) |
| learners                                     | all   | read, without fee balance                 | read own children   |
| payments                                     | all   | none                                      | read own children's |
| expenses, applications, books                | all   | none                                      | none                |
| attendance, assessments                      | all   | read and PATCH                            | read own children's marks |
| remarks                                      | all   | read, write the teacher's remarks         | read own children's |
| homework                                     | all   | read, write and delete their own          | read own classes'   |
| notices                                      | all   | read; post to own class parents or teachers | read those addressed to them |
| messages                                     | all   | conversations sent to them, and their class groups | their own, and their child's class groups |

These rules live in `backend/app/permissions.py`.
