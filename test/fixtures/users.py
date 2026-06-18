import json


def load_user_profile(user_id):
    return {"id": user_id, "active": True}


class SessionStore:
    def save(self, token):
        return token
