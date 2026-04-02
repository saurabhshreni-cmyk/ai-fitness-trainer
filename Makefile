.PHONY: dev install

dev:
	@echo "Starting backend..." && uvicorn backend:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend..." && cd frontend-react && npm run dev

install:
	pip install -r requirements.txt && cd frontend-react && npm install
