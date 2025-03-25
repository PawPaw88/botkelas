const taskHandler = {
  generateTaskId: () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let id;
    do {
      id =
        letters[Math.floor(Math.random() * letters.length)] +
        letters[Math.floor(Math.random() * letters.length)];
    } while (id === "ID");
    return id;
  },

  formatDeadline: (date, time) => {
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];

    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, "0");
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${time} ${dayName}, ${day} ${month} ${year}`;
  },

  extractPhone: (id) => {
    if (!id) return "";
    return id.split("@")[0];
  },

  normalizeUserId: (id) => {
    if (!id) return "";
    const phone = id.includes("@") ? id.split("@")[0] : id;
    return `${phone}@s.whatsapp.net`;
  },

  viewTasks: async (sock, sender, db, showIds = false) => {
    const collection = db.collection("tasks");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Mengambil tugas yang belum selesai dan mengurutkannya berdasarkan deadline terdekat
    const tasks = await collection
      .find({ deadline: { $gte: today } })
      .sort({ deadline: 1 })
      .toArray();

    if (tasks.length === 0) {
      await sock.sendMessage(sender, {
        text: "Belum ada tugas yang ditambahkan.",
      });
      return;
    }

    // Normalize sender ID untuk konsistensi
    const normalizedSender = taskHandler.normalizeUserId(sender);

    // Cek apakah ini adalah chat pribadi atau grup
    const isPrivateChat = !sender.includes("@g.us");

    let taskList = "*Daftar Tugas:*\n\n";

    // Tampilkan setiap tugas secara individu tanpa pengelompokan
    tasks.forEach((task, index) => {
      // Normalisasi completedBy array jika ada
      const normalizedCompletedBy = task.completedBy
        ? task.completedBy.map((id) => taskHandler.normalizeUserId(id))
        : [];

      // Periksa status penyelesaian untuk pengguna ini
      const userCompleted = normalizedCompletedBy.includes(normalizedSender);

      // Hitung jumlah orang yang sudah menyelesaikan
      const completedCount = normalizedCompletedBy.length;

      // Baris 1: ID dan subject
      taskList += `[ID: ${task._id}] *${task.subject}*\n`;
      // Baris 2: Judul tugas
      taskList += `${task.title}\n`;
      // Baris 3: Deadline
      taskList += `• Deadline: ${taskHandler.formatDeadline(
        new Date(task.deadline),
        task.time
      )}\n`;

      // Deskripsi tugas (jika ada)
      if (task.description) {
        taskList += `• ${task.description}\n`;
      }

      // Tampilkan status penyelesaian hanya jika di chat pribadi
      if (isPrivateChat) {
        taskList += `• Status: ${
          userCompleted ? "Selesai ✅" : "Belum Selesai ❌"
        }\n`;
      }

      // Tetap tampilkan jumlah orang yang sudah menyelesaikan
      taskList += `• ${completedCount} orang sudah menyelesaikan\n\n`;
    });

    taskList += `Kamu bisa gunakan:\n.selesai [id] - Untuk menandai tugas selesai`;
    await sock.sendMessage(sender, { text: taskList });
  },

  addTask: async (sock, sender, db, args) => {
    if (args.length < 4) {
      await sock.sendMessage(sender, {
        text:
          'Format: .tambah_tugas "[mata_kuliah]" "[judul]" [waktu] [deadline] "[deskripsi]"\n' +
          'Contoh: .tambah_tugas "Pemrograman Web" "Tugas 1 PHP" 14:00 2024-03-20 "Membuat CRUD dengan PHP"\n\n' +
          "Catatan:\n" +
          '• Gunakan tanda kutip (") untuk mata kuliah, judul, dan deskripsi\n' +
          "• Format waktu: HH:MM (contoh: 14:00)\n" +
          "• Format deadline: YYYY-MM-DD (contoh: 2024-03-20)\n" +
          "• Deskripsi bersifat opsional",
      });
      return;
    }

    // Join all arguments back into a single string to parse more effectively
    const cmdStr = args.join(" ");

    // Get subject (first quoted item)
    const subjectMatch = cmdStr.match(/"([^"]+)"/);
    if (!subjectMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Mata kuliah harus dalam tanda kutip. Contoh: "Pemrograman Web"',
      });
      return;
    }
    const subject = subjectMatch[1];

    // Get remaining string after first quoted item
    let remaining = cmdStr
      .substring(cmdStr.indexOf('"' + subject + '"') + subject.length + 2)
      .trim();

    // Get title (second quoted item)
    const titleMatch = remaining.match(/"([^"]+)"/);
    if (!titleMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Judul tugas harus dalam tanda kutip. Contoh: "Tugas 1 PHP"',
      });
      return;
    }
    const title = titleMatch[1];

    // Get remaining string after second quoted item
    remaining = remaining
      .substring(remaining.indexOf('"' + title + '"') + title.length + 2)
      .trim();

    // Split the remaining parts by space
    const parts = remaining.split(/\s+/);
    if (parts.length < 2) {
      await sock.sendMessage(sender, {
        text: "❌ Format tidak valid! Pastikan format waktu dan deadline terisi. Contoh: 14:00 2024-03-20",
      });
      return;
    }

    // Get time and deadline
    const time = parts[0];
    const dateStr = parts[1];

    // Get description (optional, could be remaining quoted text)
    let description = "";
    const descMatch = remaining
      .substring(time.length + dateStr.length + 2)
      .match(/"([^"]+)"/);
    if (descMatch) {
      description = descMatch[1];
    }

    // Validasi format waktu
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      await sock.sendMessage(sender, {
        text: "❌ Format waktu tidak valid! Gunakan format: HH:MM\nContoh: 14:00",
      });
      return;
    }

    // Validasi dan parsing format tanggal
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      await sock.sendMessage(sender, {
        text: "❌ Format tanggal tidak valid! Gunakan format: YYYY-MM-DD\nContoh: 2024-03-20",
      });
      return;
    }

    try {
      // Parse tanggal dengan reliable method
      const [year, month, day] = dateStr
        .split("-")
        .map((num) => parseInt(num, 10));
      const deadline = new Date(year, month - 1, day); // month is 0-indexed in JS Date

      // Pastikan tanggal valid
      if (isNaN(deadline.getTime())) {
        await sock.sendMessage(sender, {
          text: "❌ Tanggal tidak valid! Pastikan tanggal tersebut ada dalam kalender.",
        });
        return;
      }

      // Tambahkan waktu ke deadline
      const [hours, minutes] = time.split(":").map(Number);
      deadline.setHours(hours, minutes);

      const collection = db.collection("tasks");
      const taskId = taskHandler.generateTaskId();

      const newTask = {
        _id: taskId,
        subject,
        title,
        time,
        deadline,
        description,
        completedBy: [], // Array untuk menyimpan ID pengguna yang telah menyelesaikan tugas
        createdAt: new Date(),
      };

      await collection.insertOne(newTask);

      const confirmMessage =
        "✅ Tugas berhasil ditambahkan!\n\n" +
        `[ID: ${taskId}] *${subject}*\n` +
        `${title}\n` +
        `• Deadline: ${taskHandler.formatDeadline(deadline, time)}\n` +
        (description ? `• ${description}\n` : "") +
        "• Status: Belum Selesai";

      await sock.sendMessage(sender, { text: confirmMessage });

      // Import notification handler dan kirim notifikasi
      try {
        const notificationHandler = require("./notificationHandler");
        // Menggunakan fungsi otomatis tanpa persetujuan komting
        await notificationHandler.sendTaskNotificationAutomatically(
          sock,
          db,
          newTask
        );
      } catch (error) {
        console.error("Error sending task notification:", error);
      }
    } catch (error) {
      console.error("Error processing date:", error);
      await sock.sendMessage(sender, {
        text: "❌ Format tanggal tidak valid! Gunakan format: YYYY-MM-DD\nContoh: 2024-03-20",
      });
    }
  },

  editTask: async (sock, sender, db, args) => {
    if (args.length < 5) {
      await sock.sendMessage(sender, {
        text:
          'Format: .edit_tugas [id] "[mata_kuliah]" "[judul]" [waktu] [deadline] "[deskripsi]"\n' +
          'Contoh: .edit_tugas AB "Pemrograman Web" "Tugas 1 PHP" 14:00 2024-03-20 "Membuat CRUD dengan PHP"\n\n' +
          "Berikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    // Get task ID (first argument)
    const taskId = args[0].toUpperCase();

    // Join remaining arguments
    const cmdStr = args.slice(1).join(" ");

    // Get subject (first quoted item)
    const subjectMatch = cmdStr.match(/"([^"]+)"/);
    if (!subjectMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Mata kuliah harus dalam tanda kutip. Contoh: "Pemrograman Web"',
      });
      return;
    }
    const subject = subjectMatch[1];

    // Get remaining string after first quoted item
    let remaining = cmdStr
      .substring(cmdStr.indexOf('"' + subject + '"') + subject.length + 2)
      .trim();

    // Get title (second quoted item)
    const titleMatch = remaining.match(/"([^"]+)"/);
    if (!titleMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Judul tugas harus dalam tanda kutip. Contoh: "Tugas 1 PHP"',
      });
      return;
    }
    const title = titleMatch[1];

    // Get remaining string after second quoted item
    remaining = remaining
      .substring(remaining.indexOf('"' + title + '"') + title.length + 2)
      .trim();

    // Split the remaining parts by space
    const parts = remaining.split(/\s+/);
    if (parts.length < 2) {
      await sock.sendMessage(sender, {
        text: "❌ Format tidak valid! Pastikan format waktu dan deadline terisi. Contoh: 14:00 2024-03-20",
      });
      return;
    }

    // Get time and deadline
    const time = parts[0];
    const dateStr = parts[1];

    // Get description (optional, could be remaining quoted text)
    let description = "";
    const descMatch = remaining
      .substring(time.length + dateStr.length + 2)
      .match(/"([^"]+)"/);
    if (descMatch) {
      description = descMatch[1];
    }

    const collection = db.collection("tasks");

    // Cek apakah tugas ada
    const existingTask = await collection.findOne({ _id: taskId });
    if (!existingTask) {
      await sock.sendMessage(sender, {
        text: "❌ Tugas tidak ditemukan. Berikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    // Validasi format waktu
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      await sock.sendMessage(sender, {
        text: "❌ Format waktu tidak valid! Gunakan format: HH:MM\nContoh: 14:00",
      });
      return;
    }

    // Validasi dan parsing format tanggal
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      await sock.sendMessage(sender, {
        text: "❌ Format tanggal tidak valid! Gunakan format: YYYY-MM-DD\nContoh: 2024-03-20",
      });
      return;
    }

    try {
      // Parse tanggal dengan reliable method
      const [year, month, day] = dateStr
        .split("-")
        .map((num) => parseInt(num, 10));
      const deadline = new Date(year, month - 1, day); // month is 0-indexed in JS Date

      // Pastikan tanggal valid
      if (isNaN(deadline.getTime())) {
        await sock.sendMessage(sender, {
          text: "❌ Tanggal tidak valid! Pastikan tanggal tersebut ada dalam kalender.",
        });
        return;
      }

      // Tambahkan waktu ke deadline
      const [hours, minutes] = time.split(":").map(Number);
      deadline.setHours(hours, minutes);

      // Periksa status penyelesaian untuk pengguna ini
      const userCompleted =
        existingTask.completedBy && existingTask.completedBy.includes(sender);

      // Konfirmasi pengeditan
      const confirmMessage =
        `Apakah Anda yakin ingin mengedit tugas berikut?\n\n` +
        `*Tugas Lama:*\n` +
        `${existingTask.subject}\n` +
        `Tugas: ${existingTask.title}\n` +
        `Waktu: ${existingTask.time}\n` +
        `Deadline: ${existingTask.deadline.toLocaleDateString("id-ID")}\n` +
        (existingTask.description
          ? `Deskripsi: ${existingTask.description}\n`
          : "") +
        `Status: ${userCompleted ? "Selesai" : "Belum Selesai"}\n\n` +
        `*Tugas Baru:*\n` +
        `${subject}\n` +
        `Tugas: ${title}\n` +
        `Waktu: ${time}\n` +
        `Deadline: ${deadline.toLocaleDateString("id-ID")}\n` +
        (description ? `Deskripsi: ${description}\n` : "") +
        `Status: ${userCompleted ? "Selesai" : "Belum Selesai"}\n\n` +
        `Ketik .ya untuk mengkonfirmasi pengeditan.`;

      await sock.sendMessage(sender, { text: confirmMessage });

      // Simpan data tugas baru di session
      sock.pendingEditTask = {
        id: taskId,
        subject,
        title,
        time,
        deadline,
        description,
        completedBy: existingTask.completedBy || [], // Pertahankan status penyelesaian
      };
    } catch (error) {
      console.error("Error processing date:", error);
      await sock.sendMessage(sender, {
        text: "❌ Format tanggal tidak valid! Gunakan format: YYYY-MM-DD\nContoh: 2024-03-20",
      });
    }
  },

  deleteTask: async (sock, sender, db, args) => {
    if (args.length < 1) {
      await sock.sendMessage(sender, {
        text: "Format: .hapus_tugas [id_tugas]\nContoh: .hapus_tugas AB\n\nBerikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    const taskId = args[0].toUpperCase();
    const collection = db.collection("tasks");

    // Cek apakah tugas ada
    const task = await collection.findOne({ _id: taskId });
    if (!task) {
      await sock.sendMessage(sender, {
        text: "❌ Tugas tidak ditemukan. Berikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    // Periksa status penyelesaian untuk pengguna ini
    const userCompleted = task.completedBy && task.completedBy.includes(sender);

    // Konfirmasi penghapusan
    const confirmMessage =
      `Apakah Anda yakin ingin menghapus tugas berikut?\n\n` +
      `${task.subject}\n` +
      `Tugas: ${task.title}\n` +
      `Waktu: ${task.time}\n` +
      `Deadline: ${task.deadline.toLocaleDateString("id-ID")}\n` +
      (task.description ? `Deskripsi: ${task.description}\n` : "") +
      `Status: ${userCompleted ? "Selesai" : "Belum Selesai"}\n\n` +
      `Ketik .ya untuk mengkonfirmasi penghapusan.`;

    await sock.sendMessage(sender, { text: confirmMessage });

    // Simpan ID tugas yang akan dihapus di session
    sock.pendingDeleteTask = taskId;
  },

  toggleTaskStatus: async (sock, sender, db, args) => {
    if (args.length < 1) {
      await sock.sendMessage(sender, {
        text: "Format: .selesai [id_tugas]\nContoh: .selesai AB\n\nBerikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    const taskId = args[0].toUpperCase();
    const collection = db.collection("tasks");

    // Normalize the sender ID
    const normalizedSender = taskHandler.normalizeUserId(sender);

    // Deteksi apakah ini pesan dari grup atau pribadi
    const isPrivateChat = !sender.includes("@g.us");

    // Cek apakah tugas ada
    const task = await collection.findOne({ _id: taskId });
    if (!task) {
      await sock.sendMessage(sender, {
        text: "❌ Tugas tidak ditemukan. Berikut daftar tugas yang tersedia:",
      });
      await taskHandler.viewTasks(sock, sender, db, true);
      return;
    }

    // Normalisasi array completedBy jika ada
    const completedBy = task.completedBy
      ? task.completedBy.map((id) => taskHandler.normalizeUserId(id))
      : [];

    // Periksa apakah pengguna sudah menyelesaikan tugas
    const userCompleted = completedBy.includes(normalizedSender);

    // Toggle status untuk pengguna ini
    let updatedCompletedBy;
    if (userCompleted) {
      // Hapus pengguna dari array completedBy
      updatedCompletedBy = completedBy.filter((id) => id !== normalizedSender);
    } else {
      // Tambahkan pengguna ke array completedBy
      updatedCompletedBy = [...completedBy, normalizedSender];
    }

    // Update status
    await collection.updateOne(
      { _id: taskId },
      { $set: { completedBy: updatedCompletedBy } }
    );

    // Hanya kirim detail status tugas jika ini adalah chat pribadi
    if (isPrivateChat) {
      // Hitung jumlah orang yang sudah menyelesaikan setelah diupdate
      const completedCount = updatedCompletedBy.length;

      const statusMessage =
        `✅ Status tugas berhasil diubah!\n\n` +
        `[ID: ${task._id}] *${task.subject}*\n` +
        `${task.title}\n` +
        `• Deadline: ${taskHandler.formatDeadline(
          new Date(task.deadline),
          task.time
        )}\n` +
        (task.description ? `• ${task.description}\n` : "") +
        `• Status: ${!userCompleted ? "Selesai ✅" : "Belum Selesai ❌"}\n` +
        `• ${completedCount} orang sudah menyelesaikan`;

      await sock.sendMessage(sender, { text: statusMessage });
    }
    // Tidak perlu kirim respons untuk chat grup karena sudah ditangani di index.js
  },
};

module.exports = taskHandler;
