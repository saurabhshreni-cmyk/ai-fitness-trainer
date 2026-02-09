import cv2

# Open webcam (0 = default camera)
cap = cv2.VideoCapture(0)

# Check if camera opened successfully
if not cap.isOpened():
    print("ERROR: Cannot access webcam")
    exit()

while True:
    # Read one frame from webcam
    ret, frame = cap.read()

    if not ret:
        print("ERROR: Failed to grab frame")
        break

    # Show the frame
    cv2.imshow("Webcam Feed - Press Q to Quit", frame)

    # Press 'q' to exit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release camera and close windows
cap.release()
cv2.destroyAllWindows()
