# js-shooter-prototype


**Запуск локально**


```bash
# 1) Створити папку та ініціалізувати проєкт
mkdir js-shooter-prototype && cd js-shooter-prototype
# Скопіюйте файли з цього канвасу


# 2) Встановити залежності
npm i


# 3) Ініціалізувати git
git init
git add .
git commit -m "init js-shooter-prototype"


# 4) Запустити сервер
npm start
```


**Як користуватись**
- Відкрийте: http://localhost:3000/
- Якщо в URL немає кімнати — клієнт згенерує ID і перепише URL на `/r/<id>`.
- Надішліть цей лінк другові/у другу вкладку — будете в одній кімнаті.
- Надсилайте тестові повідомлення (`say`) через WebSocket.


**Нотатки**
- WebSocket працює на шляху `/ws` з параметрами `?room=...&playerId=...`.
- Логіка кімнат винесена в модулі `server/rooms.js`, утиліта `server/ids.js`, точка входу `server/index.js`, WS-шлюз `server/gateway.js`.
- Для продакшну додайте валідацію, персистентність та шардінг/масштабування за потреби.