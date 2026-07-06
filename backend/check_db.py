import psycopg2
conn = psycopg2.connect("postgresql://afapparel:afapparel@localhost:5432/afapparel_db")
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='shipping_tiers' ORDER BY ordinal_position")
print("shipping_tiers columns:", [r[0] for r in cur.fetchall()])
conn.close()
