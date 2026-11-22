"""API tests. Run from the backend folder:  python -m unittest -v"""
import io
import json
import tempfile
import unittest
from pathlib import Path

from app import create_app
from app.accounts import create_admin, sync_accounts
from app.db import connect
from app.repositories import MERGED, TABLES, messages

SEED = json.loads((Path(__file__).parent.parent / "seed" / "seed_data.json").read_text(encoding="utf-8"))
ORDER = ["config", "staff", "classes", "routes", "learners", "payments", "expenses", "notices", "events", "homework", "books", "remarks"]


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.uploads = Path(cls.tmp.name) / "uploads"
        cls.max_mb = 1
        cls.app = create_app({
            "DATABASE": Path(cls.tmp.name) / "test.db",
            "UPLOAD_DIR": cls.uploads,
            "MAX_UPLOAD_MB": cls.max_mb,
            "TESTING": True,
        })
        with cls.app.app_context():
            db = connect(cls.app.config["DATABASE"])
            for name in ORDER:
                for doc_id, doc in SEED[name].items():
                    TABLES[name].put(db, doc_id, doc)
            for name, repo in MERGED.items():
                for doc_id, doc in SEED[name].items():
                    repo.patch(db, doc_id, doc)
            for doc_id, doc in SEED["messages"].items():
                messages.create(db, doc_id, doc, doc["msgs"][0])
            create_admin(db, "admin", "admin123")
            sync_accounts(db)
            db.commit()
            db.close()
        cls.client = cls.app.test_client()
        cls.admin = cls.login("admin", "admin123")
        cls.teacher = cls.login("0700555910", "teacher123")      # a class teacher
        cls.parent = cls.login("0700 555 001", "parent123")      # Alice Ndanu, three children

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @classmethod
    def login(cls, login, password):
        res = cls.client.post("/api/auth/login", json={"login": login, "password": password})
        assert res.status_code == 200, res.get_json()
        return {"Authorization": "Bearer " + res.get_json()["token"]}

    def data(self, headers):
        return self.client.get("/api/bootstrap", headers=headers).get_json()["data"]

    # ── signing in ──
    def test_wrong_password_is_refused(self):
        res = self.client.post("/api/auth/login", json={"login": "admin", "password": "nope"})
        self.assertEqual(res.status_code, 401)

    def test_records_need_a_login(self):
        self.assertEqual(self.client.get("/api/bootstrap").status_code, 401)

    def test_phone_formats_are_accepted(self):
        res = self.client.post("/api/auth/login", json={"login": "+254 700 555 001", "password": "parent123"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["user"]["role"], "parent")

    # ── what each role sees ──
    def test_admin_sees_everything(self):
        data = self.data(self.admin)
        self.assertEqual(len(data["learners"]), 44)
        self.assertEqual(len(data["payments"]), 36)

    def test_parent_sees_only_own_children(self):
        data = self.data(self.parent)
        self.assertEqual({l["id"] for l in data["learners"]}, {"L1001", "L1021", "L1037"})
        self.assertTrue(all(p["learnerId"] in ("L1001", "L1021", "L1037") for p in data["payments"]))
        self.assertEqual(data["expenses"], [])
        for doc in data["attendance"]:
            for marks in doc["days"].values():
                self.assertTrue(set(marks) <= {"L1001", "L1021", "L1037"})
        for doc in data["assessments"]:
            for scores in doc["scores"].values():
                self.assertTrue(set(scores) <= {"L1001", "L1021", "L1037"})

    def test_teacher_does_not_see_money(self):
        data = self.data(self.teacher)
        self.assertEqual(data["payments"], [])
        self.assertEqual(data["expenses"], [])
        self.assertNotIn("bf", data["learners"][0])

    # ── what each role may change ──
    def test_parent_cannot_change_records(self):
        res = self.client.put("/api/learners/L1001", headers=self.parent, json={"name": "X", "admNo": "1001"})
        self.assertEqual(res.status_code, 403)
        res = self.client.patch("/api/attendance/c_pp1_2026_T3", headers=self.parent, json={"patch": {"days": {"2026-10-07": {"L1001": "P"}}}})
        self.assertEqual(res.status_code, 403)

    def test_teacher_cannot_record_payments(self):
        res = self.client.put("/api/payments/px1", headers=self.teacher, json={"learnerId": "L1001", "amount": 100, "date": "2026-10-07", "term": 3, "year": 2026})
        self.assertEqual(res.status_code, 403)

    def test_teacher_marks_register_and_results(self):
        res = self.client.patch("/api/attendance/c_g7_2026_T3", headers=self.teacher, json={"patch": {"days": {"2026-10-07": {"L1033": "P", "L1034": "A"}}}})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["days"]["2026-10-07"], {"L1033": "P", "L1034": "A"})
        res = self.client.patch("/api/assessments/c_g7_2026_T3", headers=self.teacher, json={"patch": {"scores": {"english": {"L1033": 88}}}})
        self.assertEqual(res.get_json()["scores"]["english"]["L1033"], 88)
        res = self.client.patch("/api/assessments/c_g7_2026_T3", headers=self.teacher, json={"patch": {"scores": {"english": {"L1033": 140}}}})
        self.assertEqual(res.status_code, 400)

    def test_teacher_cannot_overwrite_head_remarks(self):
        res = self.client.put("/api/remarks/L1037_2026_T3", headers=self.teacher, json={"learnerId": "L1037", "year": 2026, "term": 3, "teacher": "Improved.", "head": "Hacked"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["teacher"], "Improved.")
        self.assertNotEqual(res.get_json()["head"], "Hacked")

    def test_payment_gets_a_receipt_number(self):
        res = self.client.put("/api/payments/pnew1", headers=self.admin, json={"learnerId": "L1002", "amount": 2500, "method": "M-Pesa", "ref": "SJTEST", "date": "2026-10-07", "term": 3, "year": 2026})
        self.assertEqual(res.status_code, 200)
        self.assertRegex(res.get_json()["receiptNo"], r"^R26-\d{4}$")
        self.assertEqual(res.get_json()["by"], "School office")

    def test_duplicate_admission_number_is_refused(self):
        res = self.client.put("/api/learners/Ldup", headers=self.admin, json={"name": "Dup", "admNo": "1001", "classId": "c_pp1", "guardianPhone": "0711000000"})
        self.assertEqual(res.status_code, 409)

    def test_admitting_a_learner_creates_a_parent_account(self):
        res = self.client.put("/api/learners/L2001", headers=self.admin, json={"name": "New Child", "admNo": "2001", "classId": "c_g1", "guardianName": "New Parent", "guardianPhone": "0711 000 111", "status": "Active", "lunch": True})
        self.assertEqual(res.status_code, 200)
        self.login("0711000111", "parent123")

    # ── passwords ──
    def test_change_and_reset_password(self):
        staff = {"staffNo": "ST-099", "name": "Temp Teacher", "role": "Subject teacher", "phone": "0722 000 999", "status": "Active"}
        self.assertEqual(self.client.put("/api/staff/s99", headers=self.admin, json=staff).status_code, 200)
        temp = self.login("0722000999", "teacher123")
        res = self.client.post("/api/auth/password", headers=temp, json={"current": "teacher123", "new": "my-new-pass"})
        self.assertEqual(res.status_code, 200)
        self.login("0722000999", "my-new-pass")
        self.assertEqual(self.client.post("/api/auth/reset", headers=temp, json={"login": "0722000999"}).status_code, 403)
        res = self.client.post("/api/auth/reset", headers=self.admin, json={"login": "0722000999"})
        self.assertEqual(res.get_json()["password"], "teacher123")
        self.login("0722000999", "teacher123")
        # removing the staff member removes the login
        self.client.delete("/api/staff/s99", headers=self.admin)
        res = self.client.post("/api/auth/login", json={"login": "0722000999", "password": "teacher123"})
        self.assertEqual(res.status_code, 401)

    # ── messages ──
    def test_parent_message_identity_comes_from_login(self):
        res = self.client.put("/api/messages/mtest1", headers=self.parent, json={"learnerId": "L1037", "to": "office", "subject": "Hi", "msgs": [{"who": "staff", "name": "Fake Teacher", "text": "Hello"}]})
        self.assertEqual(res.status_code, 200)
        msg = res.get_json()["msgs"][0]
        self.assertEqual((msg["who"], msg["name"]), ("parent", "Alice Ndanu"))
        res = self.client.put("/api/messages/mtest2", headers=self.parent, json={"learnerId": "L1002", "to": "office", "subject": "Hi", "msgs": [{"text": "Not my child"}]})
        self.assertEqual(res.status_code, 403)

    # ── class group chats ──
    # The groups below are worked out from the seed rather than named, so they keep working
    # if the demo school changes: the class this teacher teaches, and a class one of the
    # test parent's children is actually in.
    def teacher_class(self):
        me = self.client.get("/api/auth/me", headers=self.teacher).get_json()["user"]["id"]
        return next(c["id"] for c in self.data(self.teacher)["classes"] if c["teacherId"] == me)

    def parent_class(self):
        return self.data(self.parent)["learners"][0]["classId"]

    def other_class(self):
        mine = {self.parent_class(), self.teacher_class()}
        return next(c["id"] for c in self.data(self.admin)["classes"] if c["id"] not in mine)

    def open_group(self, headers, class_id):
        res = self.client.post("/api/groups", headers=headers, json={"classId": class_id})
        self.assertEqual(res.status_code, 201, res.get_json())
        return res.get_json()

    def test_teacher_opens_a_group_for_their_own_class(self):
        cid = self.teacher_class()
        group = self.open_group(self.teacher, cid)
        self.assertEqual((group["kind"], group["classId"]), ("class", cid))
        self.assertTrue(group["joinToken"])
        self.assertEqual({m["role"] for m in group["members"]}, {"parent", "staff"})
        # every guardian on the class is in it, plus the class teacher and the office
        teacher_id = self.client.get("/api/auth/me", headers=self.teacher).get_json()["user"]["id"]
        logins = {m["login"] for m in group["members"]}
        self.assertIn(teacher_id, logins)
        self.assertIn("office", logins)
        guardians = {l["guardianPhone"] for l in self.data(self.admin)["learners"] if l["classId"] == cid}
        self.assertTrue(guardians.issubset(logins), "a guardian on the class was left out")

    def test_a_teacher_cannot_open_another_class_group(self):
        res = self.client.post("/api/groups", headers=self.teacher, json={"classId": self.other_class()})
        self.assertEqual(res.status_code, 403)

    def test_opening_a_group_twice_gives_the_same_one(self):
        cid = self.teacher_class()
        first = self.open_group(self.teacher, cid)
        self.assertEqual(first["id"], self.open_group(self.teacher, cid)["id"])

    def test_the_link_needs_a_sign_in(self):
        res = self.client.post("/api/groups/join", json={"token": self.open_group(self.teacher, self.teacher_class())["joinToken"]})
        self.assertEqual(res.status_code, 401)

    def test_a_parent_joins_by_link_and_posts(self):
        # the office opens the group for the class this parent has a child in
        cid = self.parent_class()
        group = self.open_group(self.admin, cid)
        res = self.client.post("/api/groups/join", headers=self.parent, json={"token": group["joinToken"]})
        self.assertEqual(res.status_code, 200, res.get_json())
        res = self.client.put("/api/messages/" + group["id"], headers=self.parent, json={"msgs": [{"text": "Is the project due Friday?", "who": "staff", "name": "Fake"}]})
        self.assertEqual(res.status_code, 200, res.get_json())
        last = res.get_json()["msgs"][-1]
        self.assertEqual((last["who"], last["name"]), ("parent", "Alice Ndanu"))

    def test_parents_are_never_given_the_link(self):
        group = self.open_group(self.admin, self.parent_class())
        self.client.post("/api/groups/join", headers=self.parent, json={"token": group["joinToken"]})
        mine = [g for g in self.client.get("/api/groups", headers=self.parent).get_json() if g["id"] == group["id"]]
        self.assertTrue(mine, "the parent should see the group they are in")
        self.assertEqual(mine[0]["joinToken"], "")
        self.assertTrue(group["joinToken"], "the office still has the link")

    def test_a_parent_of_another_class_cannot_join_or_post(self):
        group = self.open_group(self.admin, self.other_class())   # no child of theirs is in it
        res = self.client.post("/api/groups/join", headers=self.parent, json={"token": group["joinToken"]})
        self.assertEqual(res.status_code, 403)
        res = self.client.put("/api/messages/" + group["id"], headers=self.parent, json={"msgs": [{"text": "let me in"}]})
        self.assertEqual(res.status_code, 404)

    def test_the_link_can_be_switched_off(self):
        cid = self.teacher_class()
        group = self.open_group(self.teacher, cid)
        res = self.client.post("/api/groups/link/off", headers=self.teacher, json={"classId": cid})
        self.assertEqual(res.get_json()["link"], "")
        res = self.client.post("/api/groups/join", headers=self.parent, json={"token": group["joinToken"]})
        self.assertEqual(res.status_code, 404)
        # the group and its messages survive
        self.assertTrue(any(g["id"] == group["id"] for g in self.client.get("/api/groups", headers=self.teacher).get_json()))

    def test_a_made_up_token_gets_nobody_in(self):
        self.open_group(self.teacher, self.teacher_class())
        self.assertEqual(self.client.post("/api/groups/join", headers=self.parent, json={"token": "not-a-real-token"}).status_code, 404)

    def test_groups_do_not_leak_into_another_class(self):
        mine = self.open_group(self.teacher, self.teacher_class())
        other = self.open_group(self.admin, self.other_class())
        seen = self.client.get("/api/groups", headers=self.teacher).get_json()
        ids = {g["id"] for g in seen}
        self.assertIn(mine["id"], ids)
        self.assertNotIn(other["id"], ids, "a teacher should not see another class's group")

    # ── teaching material ──
    def upload(self, headers, class_id, name="module notes.pdf", body=b"%PDF-1.4 notes", **extra):
        form = {"classId": class_id, "area": "English", "title": "", "file": (io.BytesIO(body), name), **extra}
        return self.client.post("/api/files", headers=headers, data=form, content_type="multipart/form-data")

    def test_upload_then_download(self):
        res = self.upload(self.teacher, self.teacher_class())
        self.assertEqual(res.status_code, 201, res.get_json())
        doc = res.get_json()
        self.assertEqual((doc["kind"], doc["title"]), ("pdf", "module notes.pdf"))
        self.assertTrue((self.uploads / doc["storedName"]).is_file())
        self.assertNotEqual(doc["storedName"], doc["fileName"])       # the server names the file
        got = self.client.get("/api/files/" + doc["id"], headers=self.teacher)
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.data, b"%PDF-1.4 notes")
        self.assertIn("module notes.pdf", got.headers["Content-Disposition"])
        got.close()

    def test_a_title_is_used_when_given(self):
        res = self.upload(self.teacher, self.teacher_class(), title="Grade 9 module 1")
        self.assertEqual(res.get_json()["title"], "Grade 9 module 1")

    def test_a_file_name_cannot_choose_a_path(self):
        res = self.upload(self.teacher, self.teacher_class(), name="../../../escape.txt", body=b"x")
        self.assertEqual(res.status_code, 201)
        doc = res.get_json()
        self.assertTrue((self.uploads / doc["storedName"]).is_file())
        self.assertFalse((Path(doc["storedName"]).parent / "escape.txt").exists())

    def test_staff_read_every_class_and_a_parent_only_their_own(self):
        doc = self.upload(self.admin, self.parent_class()).get_json()      # the parent's class
        other = self.upload(self.admin, self.other_class()).get_json()
        mine = [r["id"] for r in self.client.get("/api/files", headers=self.parent).get_json()]
        self.assertIn(doc["id"], mine)
        self.assertNotIn(other["id"], mine)
        self.assertEqual(self.client.get("/api/files/" + other["id"], headers=self.parent).status_code, 404)
        self.assertEqual(self.client.get("/api/files/" + doc["id"], headers=self.parent).status_code, 200)
        # staff see both
        staff = {r["id"] for r in self.client.get("/api/files", headers=self.admin).get_json()}
        self.assertTrue({doc["id"], other["id"]}.issubset(staff))

    def test_a_parent_cannot_upload_or_delete(self):
        doc = self.upload(self.admin, self.parent_class()).get_json()
        self.assertEqual(self.upload(self.parent, self.parent_class()).status_code, 403)
        self.assertEqual(self.client.delete("/api/files/" + doc["id"], headers=self.parent).status_code, 403)
        self.assertTrue((self.uploads / doc["storedName"]).is_file())

    def test_a_teacher_only_works_on_their_own_class(self):
        self.assertEqual(self.upload(self.teacher, self.other_class()).status_code, 403)
        doc = self.upload(self.admin, self.teacher_class()).get_json()
        self.assertEqual(self.client.delete("/api/files/" + doc["id"], headers=self.teacher).status_code, 200)

    def test_delete_removes_the_file_and_the_row(self):
        doc = self.upload(self.admin, self.parent_class()).get_json()
        self.assertEqual(self.client.delete("/api/files/" + doc["id"], headers=self.admin).status_code, 200)
        self.assertFalse((self.uploads / doc["storedName"]).exists())
        self.assertEqual(self.client.get("/api/files/" + doc["id"], headers=self.admin).status_code, 404)

    def test_an_oversized_file_is_refused_and_leaves_nothing_behind(self):
        before = len(list(self.uploads.iterdir()))
        res = self.upload(self.admin, self.parent_class(), name="big.pdf", body=b"0" * (self.max_mb * 1024 * 1024 + 4096))
        self.assertEqual(res.status_code, 413)
        self.assertIn("MB", res.get_json()["error"])
        self.assertEqual(len(list(self.uploads.iterdir())), before)

    def test_a_row_cannot_be_made_without_a_file(self):
        res = self.client.put("/api/resources/fake", headers=self.admin, json={"classId": self.parent_class(), "title": "no bytes"})
        self.assertEqual(res.status_code, 405)

    # ── public home page ──
    def test_profile_photo(self):
        import base64
        jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
        res = self.client.put("/api/auth/photo", headers=self.teacher, json={"photo": url})
        self.assertEqual(res.status_code, 200, res.get_json())
        stamp = res.get_json()["photoAt"]
        self.assertTrue(stamp)
        # Only the stamp travels with every request; the picture comes from its own route.
        user = self.client.get("/api/bootstrap", headers=self.teacher).get_json()["user"]
        self.assertEqual(user["photoAt"], stamp)
        self.assertNotIn("photo", user)
        self.assertEqual(self.client.get("/api/auth/photo", headers=self.teacher).get_json()["photo"], url)
        # Each person has their own picture.
        self.assertEqual(self.client.get("/api/auth/photo", headers=self.parent).get_json()["photo"], "")
        # Rebuilding the accounts from the staff list keeps it.
        with self.app.app_context():
            db = connect(self.app.config["DATABASE"])
            sync_accounts(db)
            db.commit()
            db.close()
        self.assertEqual(self.client.get("/api/auth/photo", headers=self.teacher).get_json()["photo"], url)
        res = self.client.delete("/api/auth/photo", headers=self.teacher)
        self.assertEqual(res.get_json()["photoAt"], "")
        self.assertEqual(self.client.get("/api/auth/photo", headers=self.teacher).get_json()["photo"], "")

    def test_profile_photo_must_be_a_small_image(self):
        import base64
        bad = [
            "not a picture",
            "data:text/html;base64," + base64.b64encode(b"<script>").decode(),
            "data:image/jpeg;base64," + base64.b64encode(b"<svg onload=x>").decode(),
            "data:image/jpeg;base64,***",
            "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"\x00" * 500_000).decode(),
        ]
        for photo in bad:
            res = self.client.put("/api/auth/photo", headers=self.parent, json={"photo": photo})
            self.assertEqual(res.status_code, 400, photo[:40])
        self.assertEqual(self.client.put("/api/auth/photo", json={"photo": bad[0]}).status_code, 401)

    def test_public_page_and_application(self):
        res = self.client.get("/api/public")
        self.assertEqual(res.get_json()["counts"]["teachers"], 12)
        res = self.client.post("/api/public/applications", json={"child": "Baby", "parent": "Mama", "phone": "0733 111 222", "classId": "c_g2"})
        self.assertEqual(res.status_code, 201)
        apps = self.data(self.admin)["applications"]
        self.assertTrue(any(a["child"] == "Baby" and a["status"] == "New" for a in apps))

    # ── creating an account ──
    def register(self, phone, **extra):
        body = {"parent": "Grace Wanjiru", "phone": phone, "password": "family1", "child": "Tumaini", "classId": "c_g1", **extra}
        return self.client.post("/api/auth/register", json=body)

    def test_register_creates_account_and_application(self):
        res = self.register("0744 100 200")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.get_json()["user"]["role"], "parent")
        self.assertTrue(any(a["child"] == "Tumaini" and a["phone"] == "0744100200" and a["status"] == "New" for a in self.data(self.admin)["applications"]))
        self.login("0744100200", "family1")
        self.assertEqual(self.register("0744100200").status_code, 409)
        self.assertEqual(self.register("0700555001").status_code, 409)   # already a guardian
        self.assertEqual(self.register("0744100201", password="123").status_code, 400)

    def test_registered_account_follows_its_application(self):
        self.assertEqual(self.register("0744 300 400").status_code, 201)
        # saving any learner runs the account sync; the open application keeps the account
        self.client.put("/api/learners/L2002", headers=self.admin, json={"name": "Other Child", "admNo": "2002", "classId": "c_g1", "guardianName": "Other", "guardianPhone": "0711 000 222", "status": "Active"})
        self.login("0744300400", "family1")
        app = next(a for a in self.data(self.admin)["applications"] if a["phone"] == "0744300400")
        # admitted: the account stays, with the password the family chose
        self.client.put("/api/learners/L2003", headers=self.admin, json={"name": "Tumaini", "admNo": "2003", "classId": "c_g1", "guardianName": "Grace Wanjiru", "guardianPhone": "0744300400", "status": "Active"})
        self.client.put("/api/applications/" + app["id"], headers=self.admin, json={**app, "status": "Admitted"})
        self.login("0744300400", "family1")

    def test_closing_an_application_removes_the_account(self):
        self.assertEqual(self.register("0744 500 600").status_code, 201)
        app = next(a for a in self.data(self.admin)["applications"] if a["phone"] == "0744500600")
        res = self.client.put("/api/applications/" + app["id"], headers=self.admin, json={**app, "status": "Closed"})
        self.assertEqual(res.status_code, 200)
        res = self.client.post("/api/auth/login", json={"login": "0744500600", "password": "family1"})
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
