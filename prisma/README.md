## Useful SQL Queries

### Get All VTuber Posts

```sql
SELECT
	u.handle, p.content, p.postedAt
FROM Post p
INNER JOIN
	User u ON u.id = p.authorId
WHERE
	u.isVtuber IS TRUE
ORDER BY
	p.postedAt DESC
```
