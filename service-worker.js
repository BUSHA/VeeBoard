// service-worker.js

self.addEventListener("message", (event) => {
  const data = event.data

  if (data.action === "scheduleNotification") {
    const { title, body, due, offsetMinutes } = data.payload
    const dueDate = new Date(due)
    const notificationTime = dueDate.getTime() - offsetMinutes * 60 * 1000
    const delay = notificationTime - Date.now()

    if (delay > 0) {
      setTimeout(() => {
        self.registration.showNotification(title, {
          body: body,
          icon: "favicon/favicon-96x96.png",
          badge: "favicon/favicon-96x96.png",
          requireInteraction: true,
        })
      }, delay)
    } else {
      console.warn(
        "Tried to schedule a notification for a time in the past. Skipping."
      )
    }
  }
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) {
          return clientList[0].focus()
        }

        if (clients.openWindow) {
          return clients.openWindow("/")
        }
      })
  )
})
