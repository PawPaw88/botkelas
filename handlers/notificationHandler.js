const notificationHandler = {
  // Mendaftarkan pengguna untuk menerima notifikasi
  subscribeNotification: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar sebelumnya
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (existingUser) {
        // Jika pengguna sudah terdaftar dan aktif
        if (existingUser.isActive) {
          await sock.sendMessage(sender, {
            text: "❗ Anda sudah terdaftar untuk menerima notifikasi tugas dan jadwal kuliah.",
          });
          return;
        }

        // Jika pengguna terdaftar tapi tidak aktif, aktifkan kembali
        await collection.updateOne(
          { userId: normalizedSender },
          { $set: { isActive: true, updatedAt: new Date() } }
        );

        await sock.sendMessage(sender, {
          text: "✅ Notifikasi berhasil diaktifkan kembali! Anda akan menerima pemberitahuan untuk tugas baru dan jadwal kuliah 30 menit sebelum dimulai.",
        });
        return;
      }

      // Jika pengguna belum terdaftar sama sekali
      await collection.insertOne({
        userId: normalizedSender,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await sock.sendMessage(sender, {
        text: "✅ Berhasil mendaftar notifikasi! Anda akan menerima pemberitahuan untuk tugas baru dan jadwal kuliah 30 menit sebelum dimulai.",
      });
    } catch (error) {
      console.error("Error subscribing notification:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat mendaftar notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Menonaktifkan notifikasi untuk pengguna
  unsubscribeNotification: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (!existingUser) {
        await sock.sendMessage(sender, {
          text: "❗ Anda belum terdaftar untuk menerima notifikasi. Gunakan perintah .notifon untuk mendaftar.",
        });
        return;
      }

      // Jika pengguna terdaftar tapi sudah tidak aktif
      if (!existingUser.isActive) {
        await sock.sendMessage(sender, {
          text: "❗ Notifikasi Anda sudah dinonaktifkan sebelumnya.",
        });
        return;
      }

      // Nonaktifkan notifikasi
      await collection.updateOne(
        { userId: normalizedSender },
        { $set: { isActive: false, updatedAt: new Date() } }
      );

      await sock.sendMessage(sender, {
        text: "✅ Notifikasi berhasil dinonaktifkan. Anda tidak akan menerima pemberitahuan tugas baru dan jadwal kuliah.",
      });
    } catch (error) {
      console.error("Error unsubscribing notification:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat menonaktifkan notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Melihat status notifikasi pengguna
  checkNotificationStatus: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (!existingUser) {
        await sock.sendMessage(sender, {
          text: "❗ Anda belum terdaftar untuk menerima notifikasi. Gunakan perintah .notifon untuk mendaftar.",
        });
        return;
      }

      const status = existingUser.isActive
        ? "✅ Aktif - Anda akan menerima notifikasi tugas baru dan jadwal kuliah."
        : "❌ Tidak Aktif - Anda tidak akan menerima notifikasi.";

      await sock.sendMessage(sender, {
        text: `*Status Notifikasi*\n\n${status}\n\nGunakan perintah:\n.notifon - Mengaktifkan notifikasi\n.notifoff - Menonaktifkan notifikasi`,
      });
    } catch (error) {
      console.error("Error checking notification status:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat memeriksa status notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Fungsi untuk mengkonversi waktu ke menit (format "HH:MM" -> menit sejak tengah malam)
  convertTimeToMinutes: (timeString) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
  },

  // Fungsi untuk mengkonversi menit ke format waktu (menit sejak tengah malam -> "HH:MM")
  convertMinutesToTime: (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  },

  // Fungsi untuk mengirim notifikasi jadwal kuliah 30 menit sebelum dimulai
  sendClassReminder: async (sock, db) => {
    try {
      const scheduleCollection = db.collection("schedules");
      const notificationCollection = db.collection("notifications_sent");
      const scheduleHandler = require("./scheduleHandler");

      // Get current time in WIB (UTC+7)
      const now = new Date();
      // Adjust to WIB timezone by getting the UTC time first
      const utcHours = now.getUTCHours();
      const wibHours = (utcHours + 7) % 24; // Convert to WIB hours
      now.setUTCHours(utcHours); // Set back to UTC for consistency

      // Get current day in WIB
      const dayNames = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];

      // Adjust day if time conversion crosses midnight
      let dayIndex = now.getUTCDay();
      if (utcHours + 7 >= 24) {
        dayIndex = (dayIndex + 1) % 7;
      }
      const today = dayNames[dayIndex];

      // Calculate current time in minutes (since midnight WIB)
      const currentMinute = now.getUTCMinutes();
      const currentTimeInMinutes = wibHours * 60 + currentMinute;

      // Calculate time 30 minutes from now
      const thirtyMinutesLater = currentTimeInMinutes + 30;

      // Format times for logging
      const currentTimeString =
        notificationHandler.convertMinutesToTime(currentTimeInMinutes);
      const targetTimeString =
        notificationHandler.convertMinutesToTime(thirtyMinutesLater);

      console.log(`[${now.toISOString()}] System time check:`);
      console.log(`UTC Hours: ${utcHours}`);
      console.log(`WIB Hours: ${wibHours}`);
      console.log(`Current day in WIB: ${today}`);
      console.log(`Current time in WIB: ${currentTimeString}`);
      console.log(
        `Looking for classes between ${currentTimeString} - ${targetTimeString} WIB`
      );

      // Get today's schedules
      const todaySchedules = await scheduleCollection
        .find({
          day: today,
          isRecurring: true,
        })
        .toArray();

      console.log(`Found ${todaySchedules.length} schedules for ${today}`);

      // Filter upcoming schedules
      const upcomingSchedules = todaySchedules.filter((schedule) => {
        const scheduleTimeInMinutes = notificationHandler.convertTimeToMinutes(
          schedule.startTime
        );

        // Handle edge case when checking near midnight
        let adjustedScheduleTime = scheduleTimeInMinutes;
        if (currentTimeInMinutes > 1380) {
          // After 23:00 WIB
          if (scheduleTimeInMinutes < 60) {
            // Schedule is after midnight
            adjustedScheduleTime += 1440; // Add 24 hours in minutes
          }
        }

        return (
          adjustedScheduleTime > currentTimeInMinutes &&
          adjustedScheduleTime <= thirtyMinutesLater
        );
      });

      console.log(
        `Found ${upcomingSchedules.length} upcoming schedules in the next 30 minutes`
      );

      if (upcomingSchedules.length === 0) {
        return;
      }

      // Process each upcoming schedule
      for (const schedule of upcomingSchedules) {
        // Check if notification was already sent in the last 30 minutes
        const notificationKey = `${schedule._id}_${today}_${schedule.startTime}`;
        const existingNotification = await notificationCollection.findOne({
          notificationKey,
          sentAt: { $gte: new Date(now.getTime() - 30 * 60 * 1000) },
        });

        if (existingNotification) {
          console.log(
            `Notification for ${schedule.subject} already sent in the last 30 minutes, skipping.`
          );
          continue;
        }

        // Calculate minutes until class starts
        const scheduleTimeInMinutes = notificationHandler.convertTimeToMinutes(
          schedule.startTime
        );
        let minutesUntilStart = scheduleTimeInMinutes - currentTimeInMinutes;

        // Adjust if schedule is after midnight
        if (minutesUntilStart < -1380) {
          // More than 23 hours negative
          minutesUntilStart += 1440; // Add 24 hours in minutes
        }

        // Format notification message
        const message =
          `*⏰ Pengingat Jadwal Kuliah*\n\n` +
          `Hai! ${minutesUntilStart} menit lagi ada kelas:\n\n` +
          `📚 *${schedule.subject}*\n` +
          `👨‍🏫 ${schedule.lecturer}\n` +
          `📍 ${schedule.location}\n` +
          `🕒 ${schedule.startTime} WIB\n\n` +
          `_Kelas akan dimulai dalam ${minutesUntilStart} menit_`;

        // Get active subscribers
        const subscriberCollection = db.collection("notifications");
        const subscribers = await subscriberCollection
          .find({ isActive: true })
          .toArray();

        if (subscribers.length === 0) {
          console.log("No active subscribers found.");
          continue;
        }

        console.log(
          `Sending notifications to ${subscribers.length} subscribers`
        );

        // Send notifications in batches
        let successCount = 0;
        const batchSize = 5;
        const delayBetweenBatches = 1000; // 1 second

        for (let i = 0; i < subscribers.length; i += batchSize) {
          const batch = subscribers.slice(i, i + batchSize);

          const promises = batch.map(async (subscriber) => {
            try {
              const success = await notificationHandler.sendMessageWithRetry(
                sock,
                subscriber.userId,
                { text: message }
              );
              if (success) successCount++;
            } catch (error) {
              console.error(
                `Error sending notification to ${subscriber.userId}:`,
                error
              );
            }
          });

          await Promise.all(promises);

          if (i + batchSize < subscribers.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenBatches)
            );
          }
        }

        // Record that notification was sent
        await notificationCollection.insertOne({
          notificationKey,
          scheduleId: schedule._id,
          sentAt: now,
          successCount,
        });

        console.log(
          `Successfully sent notifications for ${schedule.subject} to ${successCount} subscribers`
        );
      }
    } catch (error) {
      console.error("Error sending class reminders:", error);
    }
  },

  // Fungsi untuk memulai jadwal pengecekan kelas
  startClassReminderScheduler: (sock, db) => {
    console.log("Memulai pengingat jadwal kuliah...");

    // Jalankan pengecekan pertama segera setelah bot dimulai
    notificationHandler.sendClassReminder(sock, db);

    // Jalankan pengecekan setiap 5 menit
    const interval = setInterval(() => {
      if (!global.isBotRunning) {
        console.log("Bot sedang tidak aktif, melewati pengecekan jadwal...");
        return;
      }
      notificationHandler.sendClassReminder(sock, db);
    }, 5 * 60 * 1000); // 5 menit

    // Simpan interval di variabel global agar bisa dihentikan jika perlu
    global.classReminderInterval = interval;

    console.log(
      "Pengingat jadwal kuliah berhasil dimulai dengan interval 5 menit!"
    );
  },

  // Fungsi untuk mengirim pesan WhatsApp dengan handling error dan retry
  sendMessageWithRetry: async (sock, jid, message, maxRetries = 3) => {
    let retries = 0;
    let success = false;
    let lastError = null;

    while (retries < maxRetries && !success) {
      try {
        await sock.sendMessage(jid, message);
        success = true;
      } catch (error) {
        lastError = error;
        console.log(
          `Attempt ${retries + 1} failed to send message to ${jid}. Retrying...`
        );
        // Wait a bit before retrying (increase delay with each retry)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (retries + 1))
        );
        retries++;
      }
    }

    if (!success) {
      console.error(
        `Failed to send message to ${jid} after ${maxRetries} attempts:`,
        lastError
      );
      return false;
    }

    return true;
  },

  // Mengirim notifikasi ke semua pengguna yang berlangganan secara otomatis tanpa persetujuan komting
  sendTaskNotificationAutomatically: async (sock, db, task) => {
    try {
      const notificationCollection = db.collection("notifications");
      const taskHandler = require("./taskHandler");

      // Dapatkan semua pengguna yang aktif berlangganan
      const subscribers = await notificationCollection
        .find({ isActive: true })
        .toArray();

      if (subscribers.length === 0) {
        console.log("Tidak ada pengguna yang berlangganan notifikasi.");
        return;
      }

      // Format pesan notifikasi dengan format tanggal yang sama seperti di daftar tugas
      const message =
        `*🔔 Ada Tugas Baru!*\n\n` +
        `[ID: ${task._id}] *${task.subject}*\n` +
        `${task.title}\n` +
        `• Deadline: ${taskHandler.formatDeadline(
          new Date(task.deadline),
          task.time
        )}\n` +
        (task.description ? `• ${task.description}\n` : "") +
        `\nUntuk melihat detail lengkap, ketik .tugas`;

      // Kirim pesan ke semua subscriber
      let successCount = 0;
      const batchSize = 5; // Jumlah pesan yang dikirim dalam satu batch
      const delayBetweenBatches = 3000; // Delay 3 detik antar batch

      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);

        // Kirim pesan ke batch saat ini
        const promises = batch.map(async (subscriber) => {
          try {
            const success = await notificationHandler.sendMessageWithRetry(
              sock,
              subscriber.userId,
              { text: message }
            );

            if (success) successCount++;
          } catch (error) {
            console.error(
              `Error sending notification to ${subscriber.userId}:`,
              error
            );
          }
        });

        await Promise.all(promises);

        // Jika masih ada batch selanjutnya, tunggu beberapa detik
        if (i + batchSize < subscribers.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      }

      console.log(
        `Notifikasi tugas baru berhasil dikirim ke ${successCount} dari ${subscribers.length} pengguna.`
      );
      return successCount;
    } catch (error) {
      console.error("Error sending automatic task notifications:", error);
      return 0;
    }
  },
};

module.exports = notificationHandler;
