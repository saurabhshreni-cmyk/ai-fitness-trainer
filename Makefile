.PHONY: dev dev-backend dev-frontend install test

dev-backend:
	uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend-react && npm run dev

dev:
	@echo "Starting backend..." && uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend..." && cd frontend-react && npm run dev

install:
	pip install -r requirements.txt && cd frontend-react && npm install

test:
	python -m pytest tests/ -v
