export const sendWhatsAppMessage = async (phone, name) => {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.log('WhatsApp is not configured. Skipping message for', phone);
        return false;
    }

    const countryCode = process.env.WHATSAPP_COUNTRY_CODE || '91';
    let to = String(phone).replace(/\D/g, '');
    if (to.length <= 10) {
        to = countryCode + to;
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world';
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

    const messageBody = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: templateLang },
        },
    };

    if (templateName !== 'hello_world') {
        messageBody.template.components = [
            {
                type: 'body',
                parameters: [{ type: 'text', text: name }],
            },
        ];
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody),
        });

        const data = await response.json();

        if (!response.ok) {
            console.log('Failed to send WhatsApp message:', JSON.stringify(data));
            return false;
        }

        console.log('WhatsApp message sent to', to, '-', JSON.stringify(data));
        return true;
    } catch (error) {
        console.log('Error sending WhatsApp message:', error.message);
        return false;
    }
};

export default sendWhatsAppMessage;
