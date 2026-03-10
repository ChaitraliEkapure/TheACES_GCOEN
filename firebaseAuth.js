import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
getAuth,
signInWithEmailAndPassword,
createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
apiKey: "AIzaSyAJSXEtf-YdYIzMkip8S6I4ffdSde6b52Q",
authDomain: "vital-55b1c.firebaseapp.com",
projectId: "vital-55b1c",
appId: "1:681938934534:web:ba5f6192c6d87c3c53dc87"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Wait until everything (HTML + script.js) loads
window.addEventListener("load", () => {


const signupBtn = document.getElementById("signup-btn");
const signupModal = document.getElementById("signup-modal");
const closeSignup = document.getElementById("close-signup");
const createAccountBtn = document.getElementById("create-account");

if (signupBtn && signupModal) {
    signupBtn.addEventListener("click", () => {
        signupModal.classList.remove("hidden");
        signupModal.classList.add("flex");
    });
}

if (closeSignup && signupModal) {
    closeSignup.addEventListener("click", () => {
        signupModal.classList.add("hidden");
        signupModal.classList.remove("flex");
    });
}

if (createAccountBtn) {
    createAccountBtn.addEventListener("click", async () => {

        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;

        try {

            await createUserWithEmailAndPassword(auth, email, password);

            alert("Account created successfully. Please login.");

            signupModal.classList.add("hidden");
            signupModal.classList.remove("flex");

        } catch (error) {

            const err = document.getElementById("signup-error");
            err.textContent = error.message;
            err.classList.remove("hidden");

        }

    });
}


});

// Firebase LOGIN (used by script.js)
window.login = async function(username, password) {


try {

    const userCredential =
        await signInWithEmailAndPassword(auth, username, password);

    const user = {
        username: userCredential.user.email,
        role: "staff"
    };

    state.user = user;
    localStorage.setItem("vitaltrack_user", JSON.stringify(user));

    setupWebSocket();
    render();

} catch (error) {

    const errorEl = document.getElementById("login-error");
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");

}


};