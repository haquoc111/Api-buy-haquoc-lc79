// server.js

const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

// API lịch sử phiên
const API_URL = "https://apilc79nomd5.onrender.com/sessions";

// ==========================
// Bộ nhớ dữ liệu
// ==========================
let CACHE = {
  phien: "0",
  ket_qua: "đang tải",
  xuc_xac: "0-0-0",
  du_doan: "đang phân tích",
  do_tin_cay: "0%",
  cau_dang_chay: "-"
};

// ==========================
// Chuyển tổng sang tài/xỉu
// ==========================
function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

// ==========================
// Tạo cầu
// ==========================
function buildCau(data, length = 12) {
  return data
    .slice(0, length)
    .map(i => i.ket_qua === "tài" ? "t" : "x")
    .join("");
}

// ==========================
// Đếm cầu liên tiếp
// ==========================
function getStreak(data) {

  if (!data.length) {
    return {
      side: "tài",
      count: 1
    };
  }

  const first = data[0].ket_qua;

  let count = 1;

  for (let i = 1; i < data.length; i++) {

    if (data[i].ket_qua === first) {
      count++;
    } else {
      break;
    }

  }

  return {
    side: first,
    count
  };
}

// ==========================
// Phân tích nhịp cầu
// ==========================
function analyzePattern(data) {

  let tai = 0;
  let xiu = 0;

  data.slice(0, 20).forEach(i => {
    if (i.ket_qua === "tài") tai++;
    else xiu++;
  });

  return {
    tai,
    xiu
  };
}

// ==========================
// Thuật toán dự đoán
// ==========================
function predict(data) {

  const streak = getStreak(data);

  const pattern = analyzePattern(data);

  let du_doan = "tài";
  let confidence = 50;

  // ======================
  // BÁM CẦU
  // ======================
  if (streak.count >= 3 && streak.count <= 5) {

    du_doan = streak.side;

    confidence = 72 + streak.count;

  }

  // ======================
  // BẺ CẦU MẠNH
  // ======================
  else if (streak.count >= 6) {

    du_doan = streak.side === "tài"
      ? "xỉu"
      : "tài";

    confidence = 78;

  }

  // ======================
  // CẦU 1-1
  // ======================
  else {

    const recent = data
      .slice(0, 6)
      .map(i => i.ket_qua);

    let alternating = true;

    for (let i = 1; i < recent.length; i++) {

      if (recent[i] === recent[i - 1]) {
        alternating = false;
        break;
      }

    }

    if (alternating) {

      du_doan = recent[0] === "tài"
        ? "xỉu"
        : "tài";

      confidence = 68;

    } else {

      // ======================
      // Nghiêng theo thống kê
      // ======================
      if (pattern.tai > pattern.xiu) {

        du_doan = "tài";

        confidence = 60 + Math.min(
          pattern.tai - pattern.xiu,
          12
        );

      } else {

        du_doan = "xỉu";

        confidence = 60 + Math.min(
          pattern.xiu - pattern.tai,
          12
        );

      }

    }

  }

  // ======================
  // Chống FULL TÀI/XỈU
  // ======================
  if (confidence > 92) {
    confidence = 92;
  }

  if (confidence < 55) {
    confidence = 55;
  }

  return {
    du_doan,
    do_tin_cay: confidence + "%"
  };

}

// ==========================
// Lấy dữ liệu API
// ==========================
async function updateData() {

  try {

    const res = await axios.get(API_URL, {
      timeout: 10000
    });

    let sessions = [];

    // ======================
    // Hỗ trợ nhiều dạng API
    // ======================
    if (Array.isArray(res.data)) {
      sessions = res.data;
    }

    else if (Array.isArray(res.data.history)) {
      sessions = res.data.history;
    }

    else if (Array.isArray(res.data.sessions)) {
      sessions = res.data.sessions;
    }

    if (!sessions.length) {
      console.log("Không có dữ liệu");
      return;
    }

    // ======================
    // Chuẩn hóa dữ liệu
    // ======================
    const parsed = sessions.map(item => {

      let x1 = Number(
        item.dice1 ||
        item.x1 ||
        item.first ||
        1
      );

      let x2 = Number(
        item.dice2 ||
        item.x2 ||
        item.second ||
        1
      );

      let x3 = Number(
        item.dice3 ||
        item.x3 ||
        item.third ||
        1
      );

      const total = x1 + x2 + x3;

      return {

        phien:
          item.session ||
          item.phien ||
          item.id ||
          "0",

        ket_qua:
          item.result ||
          item.ket_qua ||
          getTaiXiu(total),

        xuc_xac: `${x1}-${x2}-${x3}`

      };

    });

    // ======================
    // Mới nhất lên đầu
    // ======================
    parsed.sort((a, b) => Number(b.phien) - Number(a.phien));

    const newest = parsed[0];

    // ======================
    // Thuật toán dự đoán
    // ======================
    const prediction = predict(parsed);

    CACHE = {

      phien: newest.phien,

      ket_qua: newest.ket_qua,

      xuc_xac: newest.xuc_xac,

      du_doan: prediction.du_doan,

      do_tin_cay: prediction.do_tin_cay,

      cau_dang_chay: buildCau(parsed)

    };

    console.log("Đã cập nhật:", CACHE);

  } catch (err) {

    console.log("Lỗi API:", err.message);

  }

}

// ==========================
// API chính
// ==========================
app.get("/", (req, res) => {

  res.json(CACHE);

});

// ==========================
// API full lịch sử + dự đoán
// ==========================
app.get("/predict", (req, res) => {

  res.json({
    status: "success",
    data: CACHE
  });

});

// ==========================
// Auto cập nhật
// ==========================
updateData();

setInterval(updateData, 5000);

// ==========================
// Start server
// ==========================
app.listen(PORT, () => {

  console.log(`Server running port ${PORT}`);

});