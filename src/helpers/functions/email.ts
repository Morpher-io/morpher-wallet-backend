import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

import { Logger } from './winston';
import { Email_Template, Email_Log, User } from '../../database/models';

const SES = new SESClient({
    region: 'eu-west-1',
    apiVersion: '2010-12-01',

});

const SES_NOTIFICATIONS = new SESClient({
    region: 'eu-central-1',
    apiVersion: '2010-12-01'
});

export async function resetSendLimit(user) {
    user.payload.email2fa_send_timestamp = Date.now();
    user.payload.email2fa_send_count = 0;
    user.changed('payload', true);
    await user.save();
}

export async function checkSendLimit(user: User) {
    if (!user.payload.email2fa_send_timestamp || user.payload.email2fa_send_timestamp < Date.now() - 1000 * 60 * 60) {
        user.payload.email2fa_send_timestamp = Date.now()
        user.payload.email2fa_send_count = 0;
        user.changed('payload', true);
    }

    user.payload.email2fa_send_count = (user.payload.email2fa_send_count || 0) + 1;
    user.changed('payload', true);
    await user.save()
    
    if (user.payload.email2fa_send_count > 20) {
        Logger.warn({ data: { user: user.email, eth_address: user.eth_address, email2fa_send_count: user.payload.email2fa_send_count} , message: '2FA Email Send Limit Reached'});

        return false
    } else {
        return true
    }
}

export async function sendEmail2FA(payload, email, user) {
    const lang = user.payload.app_lang || 'en';

    let email_name = 'Email 2FA'

    if (user.payload.registerConfirmation == true) {
        email_name = 'Email 2FA Register'
    }

    let email_template = await Email_Template.findOne({ where: { template_name: email_name, lang }})
    // Fallback in case we add new languages and don't have a template yet.
    if(!email_template){
        email_template = await Email_Template.findOne({ where: { template_name: email_name, lang: 'en' }})
    }

    const from_address = email_template.from_address;
    let html = email_template.template_html;
    let text = email_template.template_text;
    let subject = email_template.subject;

    html = html.replace('{{2FA_CODE}}', payload)
    text = text.replace('{{2FA_CODE}}', payload)
    subject = subject.replace('{{2FA_CODE}}', payload)

    const params = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: {
                    Data: text
                },
                Html: {
                    Data: html
                }
            },
            Subject: {
                Data: subject
            }
        },
        Source: from_address,
        ConfigurationSetName: process.env.EMAIL_NOTIFICATIONS_NAME ? process.env.EMAIL_NOTIFICATIONS_NAME : undefined
    };


    let emailSendCommand = new SendEmailCommand(params)

    let response

    if (from_address.includes('@notifications.morpher.com')) {
        response = await SES_NOTIFICATIONS.send(emailSendCommand);
    } else {
        response = await SES.send(emailSendCommand);
    }


    try {

        const log:any = {
        
            id: response.MessageId,
            aws_sent_status: 'success',
            email,
            email_template_id: email_template.id
        }
        
        // Insert Email Logs
        await Email_Log.create(log);
    } catch (error){
        Logger.error({ source: 'sendEmail2FA', data:  {email}, message: error.message || error.toString() } );
    }
    
}

export async function sendEmailChanged(payload, email, user) {
    const lang = user.payload.app_lang || 'en';
    let email_template = await Email_Template.findOne({ where: { template_name: 'Email Changed', lang }});

    // Fallback in case we add new languages and don't have a template yet.
    if(!email_template){
        email_template = await Email_Template.findOne({ where: { template_name: 'Email Changed', lang: 'en' }})
    }
    
    const from_address = email_template.from_address;
    let html = email_template.template_html;
    let text = email_template.template_text;
    let subject = email_template.subject;

    html = html.replace('{{EMAIL_ADDRESS}}', payload)
    text = text.replace('{{EMAIL_ADDRESS}}', payload)
    subject = subject.replace('{{EMAIL_ADDRESS}}', payload)

    const params = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: {
                    Data: text
                },
                Html: {
                    Data: html
                }
            },
            Subject: {
                Data: subject
            }
        },
        Source: from_address,
        ConfigurationSetName: process.env.EMAIL_NOTIFICATIONS_NAME ? process.env.EMAIL_NOTIFICATIONS_NAME : undefined

    };

    let emailSendCommand = new SendEmailCommand(params)

    let response

    if (from_address.includes('@notifications.morpher.com')) {
        response = await SES_NOTIFICATIONS.send(emailSendCommand);
    } else {
        response = await SES.send(emailSendCommand);
    }

    try {
        const log:any = {
            id: response.MessageId,
            aws_sent_status: 'success',
            email,
            email_template_id: email_template.id
        }
        
        // Insert Email Logs
        await Email_Log.create(log);
    } catch (error){
        Logger.error({ source: 'sendEmail2FA', data:  {email}, message: error.message || error.toString() } );
    }
}
