(function () {
  var STORAGE_KEY = "owner-key";

  function generate() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.prototype.map
      .call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
  }

  var key = localStorage.getItem(STORAGE_KEY);
  if (!key) {
    key = generate();
    localStorage.setItem(STORAGE_KEY, key);
  }
  window.ownerKey = key;
})();
