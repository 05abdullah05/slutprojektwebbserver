// When the document is fully loaded and ready crete a connection with the server
$(document).ready(() => {
    let socket = io();

    // When the send button is clicked
    $("#send").click(() => {
        // Get the message from the input field and remove extra spaces
        let message = $("#message").val().trim();
        if (message) {
            postMessages({ message });
            $("#message").val('');
        }
    });

    // Function to add messages to the chat window
    function addMessages(message) {
        // Check if the message sender is the current user
        const isCurrentUser = message.name === $("#profile-name").text();
        // Create HTML for the message box
        let messageBox = `<div class="sent-box"><h4>${message.name}</h4><p>${message.message}</p>`;
        // If the sender is the current user, add a delete button to the message box
        if (isCurrentUser) {
            messageBox += `<button class="delete-button" data-id="${message.chatID}">Delete</button>`;
        }
        // Close the message box div
        messageBox += `</div>`;
        $("#messages").append(messageBox);
    }

    // Function to fetch messages from the server
    function getMessages() {
        // Send a GET request to the server to fetch messages
        $.get("/message", (data) => {
            data.forEach(addMessages);
        });
    }

    // Function to post messages to the server
    function postMessages(message) {
        $.post("/message", message);
    }

    // When a new message is received from the server, add it to the chat window
    socket.on("message", addMessages);

    // When a delete button is clicked
    $(document).on('click', '.delete-button', function () {
        // Get the ID of the message to be deleted
        const messageID = $(this).data('id');
        $.post("/message/delete", { messageID }, () => {
            $(this).parent().remove();
        });
    });

    // Fetch messages from the server when the page loads
    getMessages();
});
