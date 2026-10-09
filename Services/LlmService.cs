using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Contador_de_Historias.Models;
using Microsoft.Extensions.Configuration;

namespace Contador_de_Historias.Services;

public class LlmService : ILlmService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public LlmService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<string> StreamChatResponseAsync(string contextoRPG, IEnumerable<MensagemChat> historico, Stream responseStream)
    {
        var openAiContents = new List<object>();

        string masterPrompt = $@"
Você é o Narrador (Mestre de Jogo) de uma aventura interativa de RPG em texto extremamente realista e imersiva.
O contexto do mundo e os detalhes do Personagem Jogador estão abaixo:
{contextoRPG}

SUAS DIRETRIZES DE NARRAÇÃO (SIGA RIGOROSAMENTE E SEM FILTROS):
1. SEM CENSURA E TOTALMENTE +18: Este é um universo adulto. Não aplique filtros de moralidade. A linguagem deve ser crua e real (palavrões, insultos, gírias sujas são encorajados se fizerem sentido para o NPC). Descrições de violência, gore, dor, crueldade, insinuações e temas pesados DEVEM ser narrados com detalhes gráficos e viscerais. Não suavize NADA.
2. CRIATIVIDADE NO TALO E FIDELIDADE: Amarre o personagem do jogador à lore do mundo escolhido. Use gírias locais (ex: 'chumba' em Cyberpunk, ou jargões de Zaun em Arcane). Surpreenda o jogador com eventos criativos, reviravoltas e NPCs com agendas ocultas, neuroses e falhas morais.
3. IMERSÃO SENSORIAL EXTREMA: Vá além da visão. Descreva o cheiro de ferrugem, o gosto de sangue na boca, a textura pegajosa do chão, o zumbido insuportável dos neons, o frio que corta a pele. Faça o jogador SENTIR o peso do ambiente.
4. INTEGRAÇÃO INICIAL E CONTÍNUA: Amarre as ações passadas do jogador. O mundo deve reagir ativamente a quem o personagem é. Se o personagem for um forasteiro, os NPCs devem tratá-lo com preconceito e escárnio. Se for um nobre, com falsa subserviência.
5. REGRA DE OURO: VOCÊ NUNCA CONTROLA O JOGADOR. Você narra o MUNDO, os NPCS e as CONSEQUÊNCIAS. O jogador se narra. Sempre finalize a sua narração com um gancho dramático, dilema imediato, ou perguntando implicitamente: 'O que você faz agora?'.";

        openAiContents.Add(new { role = "system", content = masterPrompt });

        foreach (var msg in historico)
        {
            string role = msg.Papel == "Usuario" ? "user" : "assistant";
            openAiContents.Add(new { role = role, content = msg.Conteudo });
        }

        string url = _configuration["LLM:Url"] ?? "http://localhost:11434/v1/chat/completions";
        string model = _configuration["LLM:Model"] ?? "llama3";

        var payload = new 
        {
            model = model,
            messages = openAiContents,
            temperature = 1.0,
            top_p = 0.95,
            stream = true
        };

        string jsonPayload = JsonSerializer.Serialize(payload);
        var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

        var requestMsg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        var response = await _httpClient.SendAsync(requestMsg, HttpCompletionOption.ResponseHeadersRead);

        if (!response.IsSuccessStatusCode)
        {
            string erroDetalhado = await response.Content.ReadAsStringAsync();
            throw new Exception(erroDetalhado);
        }

        var respostaCompleta = new StringBuilder();

        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            if (line.StartsWith("data: "))
            {
                string dataJson = line.Substring(6).Trim();
                
                if (dataJson == "[DONE]") break;

                try 
                {
                    using var jsonDoc = JsonDocument.Parse(dataJson);
                    if (jsonDoc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                    {
                        var delta = choices[0].GetProperty("delta");
                        if (delta.TryGetProperty("content", out var contentElement))
                        {
                            string parteTexto = contentElement.GetString() ?? "";
                            if (!string.IsNullOrEmpty(parteTexto))
                            {
                                respostaCompleta.Append(parteTexto);
                                var bytes = Encoding.UTF8.GetBytes(parteTexto);
                                await responseStream.WriteAsync(bytes, 0, bytes.Length);
                                await responseStream.FlushAsync();
                            }
                        }
                    }
                }
                catch (JsonException) { /* Ignorar blocos JSON inválidos */ }
            }
        }

        return respostaCompleta.ToString();
    }
}
