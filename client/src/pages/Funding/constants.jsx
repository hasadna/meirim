import React from 'react';
import * as Icons from 'assets/funding';

export const paymentAmountOptions = [50, 75, 100, 150, 200, 250];

export const roadmap = [
    {
        id: 'advanced-notifications',
        title: 'התראות מתקדמות',
        desciption: 'אנחנו עובדים על שליחת התראות בקנה מידה ארצי סביב נושאי עניין שונים,  כגון טבע וחופים, תחבורה, תעסוקה ומסחר, על מנת שתוכלו לעקוב אחרי נושאים רחבים שמעניינים אתכם',
        icon: <Icons.NotificationIcon/>
    },
    {
        id: 'build-permits',
        title: 'פרסום היתרי בנייה',
        desciption: 'אנחנו מעשירים את המידע התכנוני הנגיש לכם ומוסיפים פרסום של היתרי בנייה ובפרט בקשות להקלות ושימושים חורגים	',
        icon: <Icons.ConstructionIcon/>
    },
    {
        id: 'trees',
        title: 'לעדכן כאשר ניתנים רישיונות כריתה לעצים',
        desciption: 'האתר שלנו יספק לכם התראות מיידיות על עצים הנמצאים בסכנת כריתה כך שתוכלו לערער ולהציל עוד עץ!',
        icon: <Icons.TreeIcon/>
    },
    {
        id: 'develop-map',
        title: 'לפתח את המפה של מעירים',
        desciption: 'בקרוב, כל מה שהולכים לבנות לכם ליד הבית יופיע על גבי מפה, בעזרתה תוכלו לדעת מה מתוכנן באופן ידידותי ונוח.',
        icon: <Icons.MapIcon/>
    },
    {
        id: 'expand-community',
        title: 'הרחבת הקהילה הדיגיטלית',
        desciption: 'מעירים שואפת להיות פלטפורמה שתחבר קהלים שונים ותאפשר שיח מקצועי ומפרה. כדי להעלות לסדר היום הציבורי את השיח התכנוני ולהחזיר את השליטה במרחב לידיים שלנו, אנחנו צריכים אתכם איתנו!',
        icon: <Icons.CommunityIcon/>
    }
];

export const fundingEndGoal = 100000;

export const fundingYoutubeVideoId = 'e1Q7zj_2f0I';

export const successPageTransactionCompleteMessage = 'success-page-transaction-complete';
