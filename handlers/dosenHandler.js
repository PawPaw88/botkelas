const dosenHandler = {
  // Fungsi untuk menghasilkan ID unik 2 huruf
  generateUniqueId: () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let id;
    do {
      id =
        letters[Math.floor(Math.random() * letters.length)] +
        letters[Math.floor(Math.random() * letters.length)];
    } while (id === "ID"); // Hindari kombinasi yang mungkin membingungkan
    return id;
  },

  // Melihat daftar kontak dosen
  viewDosen: async (sock, sender, db, showIds = false) => {
    const collection = db.collection("dosen");

    // Mengambil dan mengurutkan kontak dosen berdasarkan nama
    const dosen = await collection.find({}).sort({ nama: 1 }).toArray();

    if (dosen.length === 0) {
      await sock.sendMessage(sender, {
        text: "Belum ada kontak dosen yang ditambahkan.",
      });
      return;
    }

    let dosenList = "*Daftar Kontak Dosen:*\n\n";

    dosen.forEach((d) => {
      if (showIds) {
        dosenList += `[ID: ${d._id}] `;
      }
      dosenList += `*${d.nama}*\n`;
      dosenList += `• No. HP: ${d.noHP}\n\n`;
    });

    await sock.sendMessage(sender, { text: dosenList });
  },

  // Menambah kontak dosen baru
  addDosen: async (sock, sender, db, args) => {
    if (args.length < 2) {
      await sock.sendMessage(sender, {
        text:
          'Format: .tambah_dosen "[nama]" "[no_hp]"\n' +
          'Contoh: .tambah_dosen "Prof. Dr. Budi Santoso" "08123456789"\n\n' +
          'Gunakan tanda kutip (") untuk teks yang mengandung spasi',
      });
      return;
    }

    // Join all arguments to parse quoted strings
    const cmdStr = args.join(" ");

    // Parse nama (first quoted item)
    const namaMatch = cmdStr.match(/"([^"]+)"/);
    if (!namaMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Nama dosen harus dalam tanda kutip. Contoh: "Prof. Dr. Budi Santoso"',
      });
      return;
    }
    const nama = namaMatch[1];

    // Get remaining string after first quoted item
    let remaining = cmdStr
      .substring(cmdStr.indexOf('"' + nama + '"') + nama.length + 2)
      .trim();

    // Parse no HP (second quoted item)
    const noHpMatch = remaining.match(/"([^"]+)"/);
    if (!noHpMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Nomor HP harus dalam tanda kutip. Contoh: "08123456789"',
      });
      return;
    }
    const noHP = noHpMatch[1];

    // Validate phone number format (simple validation)
    if (!/^[0-9+\-\s]{10,15}$/.test(noHP.replace(/\s/g, ""))) {
      await sock.sendMessage(sender, {
        text: "❌ Format nomor HP tidak valid! Pastikan nomor HP terdiri dari 10-15 digit angka.",
      });
      return;
    }

    const collection = db.collection("dosen");
    const dosenId = dosenHandler.generateUniqueId();

    await collection.insertOne({
      _id: dosenId,
      nama,
      noHP,
      createdAt: new Date(),
    });

    const confirmMessage =
      "✅ Kontak dosen berhasil ditambahkan!\n\n" +
      `*${nama}*\n` +
      `No. HP: ${noHP}\n`;

    await sock.sendMessage(sender, { text: confirmMessage });
  },

  // Mengedit kontak dosen yang sudah ada
  editDosen: async (sock, sender, db, args) => {
    if (args.length < 3) {
      await sock.sendMessage(sender, {
        text:
          'Format: .edit_dosen [id] "[nama]" "[no_hp]"\n' +
          'Contoh: .edit_dosen AB "Prof. Dr. Budi Santoso" "08123456789"\n\n' +
          'Gunakan tanda kutip (") untuk teks yang mengandung spasi\n\n' +
          "Berikut daftar dosen yang tersedia:",
      });
      await dosenHandler.viewDosen(sock, sender, db, true);
      return;
    }

    // Get dosen ID (first argument)
    const dosenId = args[0].toUpperCase();

    // Join remaining arguments to parse quoted strings
    const cmdStr = args.slice(1).join(" ");

    // Parse nama (first quoted item)
    const namaMatch = cmdStr.match(/"([^"]+)"/);
    if (!namaMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Nama dosen harus dalam tanda kutip. Contoh: "Prof. Dr. Budi Santoso"',
      });
      return;
    }
    const nama = namaMatch[1];

    // Get remaining string after first quoted item
    let remaining = cmdStr
      .substring(cmdStr.indexOf('"' + nama + '"') + nama.length + 2)
      .trim();

    // Parse no HP (second quoted item)
    const noHpMatch = remaining.match(/"([^"]+)"/);
    if (!noHpMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Nomor HP harus dalam tanda kutip. Contoh: "08123456789"',
      });
      return;
    }
    const noHP = noHpMatch[1];

    const collection = db.collection("dosen");

    // Check if dosen exists
    const existingDosen = await collection.findOne({ _id: dosenId });
    if (!existingDosen) {
      await sock.sendMessage(sender, {
        text: "❌ Kontak dosen tidak ditemukan. Berikut daftar dosen yang tersedia:",
      });
      await dosenHandler.viewDosen(sock, sender, db, true);
      return;
    }

    // Validate phone number format (simple validation)
    if (!/^[0-9+\-\s]{10,15}$/.test(noHP.replace(/\s/g, ""))) {
      await sock.sendMessage(sender, {
        text: "❌ Format nomor HP tidak valid! Pastikan nomor HP terdiri dari 10-15 digit angka.",
      });
      return;
    }

    // Confirmation message before editing
    const confirmMessage =
      `Apakah Anda yakin ingin mengedit kontak dosen berikut?\n\n` +
      `*Kontak Lama:*\n` +
      `${existingDosen.nama}\n` +
      `No. HP: ${existingDosen.noHP}\n` +
      `\n*Kontak Baru:*\n` +
      `${nama}\n` +
      `No. HP: ${noHP}\n` +
      `\nKetik .ya untuk mengkonfirmasi pengeditan.`;

    await sock.sendMessage(sender, { text: confirmMessage });

    // Store new data in session for confirmation
    sock.pendingEditDosen = {
      id: dosenId,
      nama,
      noHP,
    };
  },

  // Menghapus kontak dosen
  deleteDosen: async (sock, sender, db, args) => {
    if (args.length < 1) {
      await sock.sendMessage(sender, {
        text: "Format: .hapus_dosen [id_dosen]\nContoh: .hapus_dosen AB\n\nBerikut daftar dosen yang tersedia:",
      });
      await dosenHandler.viewDosen(sock, sender, db, true);
      return;
    }

    const dosenId = args[0].toUpperCase();
    const collection = db.collection("dosen");

    // Check if dosen exists
    const dosen = await collection.findOne({ _id: dosenId });
    if (!dosen) {
      await sock.sendMessage(sender, {
        text: "❌ Kontak dosen tidak ditemukan. Berikut daftar dosen yang tersedia:",
      });
      await dosenHandler.viewDosen(sock, sender, db, true);
      return;
    }

    // Confirmation message before deletion
    const confirmMessage =
      `Apakah Anda yakin ingin menghapus kontak dosen berikut?\n\n` +
      `${dosen.nama}\n` +
      `No. HP: ${dosen.noHP}\n` +
      `\nKetik .ya untuk mengkonfirmasi penghapusan.`;

    await sock.sendMessage(sender, { text: confirmMessage });

    // Store dosen ID in session for confirmation
    sock.pendingDeleteDosen = dosenId;
  },
};

module.exports = dosenHandler;
