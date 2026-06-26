from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime

from db import get_db, SessionLocal, GubaPost
from eastmoney_scraper import scrape_all_categories

router = APIRouter()


def _sync_guba_posts(code: str):
    """Background task to scrape and save guba posts to DB."""
    db = SessionLocal()
    try:
        print(f"[guba_sync] Starting scrape for {code}")
        data = scrape_all_categories(code)
        
        count = 0
        for category, posts in data.items():
            for post in posts:
                try:
                    stmt = sqlite_insert(GubaPost).values(
                        code=code,
                        post_id=post["post_id"],
                        title=post["title"],
                        author=post["author"],
                        read_count=post["read_count"],
                        comment_count=post["comment_count"],
                        post_time=post["post_time"],
                        url=post["url"],
                        category=post["category"],
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code", "post_id"],
                        set_={
                            "read_count": stmt.excluded.read_count,
                            "comment_count": stmt.excluded.comment_count,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    count += 1
                except Exception as e:
                    print(f"[guba_sync] Error saving post: {e}")
        
        db.commit()
        print(f"[guba_sync] Saved {count} posts for {code}")
    
    except Exception as e:
        db.rollback()
        print(f"[guba_sync] Error: {e}")
    finally:
        db.close()


@router.get("/{code}")
async def get_guba_data(code: str, db: Session = Depends(get_db)):
    """
    Get guba posts from DB. If no data exists, return empty arrays.
    Use POST /api/guba/sync/{code} to trigger scraping.
    """
    try:
        posts = (
            db.query(GubaPost)
            .filter(GubaPost.code == code)
            .order_by(GubaPost.updated_at.desc())
            .limit(100)
            .all()
        )
        
        result = {
            "announcement": [],
            "research": [],
            "news": [],
        }
        
        for post in posts:
            item = {
                "title": post.title,
                "author": post.author,
                "time": post.post_time,
                "reads": str(post.read_count),
                "replies": str(post.comment_count),
                "url": post.url,
                "category": post.category,
            }
            
            if post.category in result:
                result[post.category].append(item)
        
        return {
            "code": code,
            "data": result,
            "total": len(posts),
            "source": "database" if posts else "empty",
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync/{code}")
async def trigger_guba_sync(code: str, background_tasks: BackgroundTasks):
    """Trigger background scraping task for a stock code."""
    background_tasks.add_task(_sync_guba_posts, code)
    return {"status": "started", "code": code}
