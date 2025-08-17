import secrets
import string
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_api_key(prefix_len: int = 8, total_len: int = 40) -> tuple[str, str]:
    """Return (full_key, prefix)."""
    alphabet = string.ascii_letters + string.digits
    token = "".join(secrets.choice(alphabet) for _ in range(total_len))
    prefix = token[:prefix_len]
    return token, prefix


def hash_key(key: str) -> str:
    return pwd_context.hash(key)


def verify_key(key: str, hashed: str) -> bool:
    return pwd_context.verify(key, hashed)

