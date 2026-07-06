"""Create users table and admin user directly via raw SQL."""
import asyncio
import ssl
import asyncpg
from passlib.context import CryptContext

NEON_DSN = "postgresql://neondb_owner:npg_Nm2dHKgRoLX4@ep-blue-cell-aion46an.c-4.us-east-1.aws.neon.tech/neondb"
ADMIN_EMAIL = "admin@afapparels.com"
ADMIN_PASSWORD = "Admin@123456"

async def main():
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    conn = await asyncpg.connect(NEON_DSN, ssl=ssl_ctx)
    print("Connected to Neon DB")

    # Create users table if not exists
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL UNIQUE,
            hashed_password VARCHAR(255),
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            phone VARCHAR(50),
            account_type VARCHAR(20) NOT NULL DEFAULT 'wholesale',
            is_admin BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            email_verified BOOLEAN NOT NULL DEFAULT false,
            email_verification_token VARCHAR(255),
            activation_token VARCHAR(255),
            activation_token_expires TIMESTAMPTZ,
            password_reset_token VARCHAR(255),
            password_reset_expires TIMESTAMPTZ,
            last_login TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    print("users table: OK")

    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed = pwd_ctx.hash(ADMIN_PASSWORD)

    existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", ADMIN_EMAIL)
    if existing:
        await conn.execute(
            "UPDATE users SET hashed_password=$1, is_admin=true, is_active=true, email_verified=true WHERE email=$2",
            hashed, ADMIN_EMAIL
        )
        print("Admin user: UPDATED")
    else:
        await conn.execute("""
            INSERT INTO users (email, hashed_password, first_name, last_name,
                               is_admin, is_active, email_verified, account_type)
            VALUES ($1, $2, $3, $4, true, true, true, $5)
        """, ADMIN_EMAIL, hashed, "Admin", "User", "wholesale")
        print("Admin user: CREATED")

    await conn.close()
    print(f"\n  Email   : {ADMIN_EMAIL}")
    print(f"  Password: {ADMIN_PASSWORD}")
    print("\nDone! Ab login karo: http://localhost:3000/login")

asyncio.run(main())
